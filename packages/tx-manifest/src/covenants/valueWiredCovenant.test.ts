import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import manifestJson from "../__fixtures__/vaultlet.manifest.json";
import { findAction, normaliseManifest } from "../document/normalise";
import { deriveCovenantAddress } from "./covenant";
import { declaredParamTypes } from "./declaredTypes";

/**
 * A covenant some of whose parameters the document writes as bare values.
 *
 * A deployment mostly wires a compile parameter to a name, and the name carries the format's own
 * declared type. `SLOT_COUNT: "2"` and `WITH_BURN: "false"` declare nothing — that position is a
 * deployment's wiring rather than a list of parameters. So the value arrives with no type, and
 * `"2"` is not a number until something says at what width. A width is part of the address.
 *
 * SimplicityHL states a parameter's type nowhere in its source either: `param::NAME` takes the
 * type of the position it is written in, worked out by the type checker. The compiler is the only
 * thing that can say, which is why it is asked — and why a document that writes a value where
 * nothing can be asked is refused rather than built.
 *
 * **What this proves and what it does not.** It proves this runtime turns the document into
 * exactly the argument string below. That the string compiles to any particular address is a
 * question for the wallet's compiler, which this package deliberately does not hold.
 */

const KEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const ASSET_STATED = `a0${"00".repeat(30)}0a`;
const ASSET_COMMITTED = `0a${"00".repeat(30)}a0`;
const RESERVE_HASH = "cc".repeat(32);

/** This deployment's field values, as `Withdraw` reads them back off it. */
const INSTANCE = {
	OWNER_PUB_KEY: KEY,
	RESERVE_COV_HASH: RESERVE_HASH,
	TIMEOUT: "900000",
	VAULT_AMOUNT: "50000",
	VAULT_ASSET_ID: ASSET_STATED,
};

/**
 * The compiler's answer for the vault contract, pinned so this file needs no compiler.
 *
 * Not a reading of the contract text, and it could not be one — a reader that recovered these
 * from the source would be reimplementing the type checker, and the failure mode of getting one
 * wrong is a value encoded at a width nobody stated.
 */
const DECLARED = { SLOT_COUNT: "u8", WITH_BURN: "bool" };

const SOURCE = readFileSync(
	new URL("../__fixtures__/contracts/vault.simf", import.meta.url),
	"utf8",
);

const { manifest } = normaliseManifest(manifestJson as unknown as Record<string, unknown>);

async function derive(input: { contractParamTypes?: () => Record<string, string> } = {}) {
	const action = findAction(manifest, "Withdraw");

	if (!action) {
		throw new Error("This fixture declares no action named Withdraw.");
	}

	const calls: {
		argumentsJson: string;
		extraLeavesJson: string;
		includeDebugSymbols: boolean;
		source: string;
	}[] = [];
	const result = await deriveCovenantAddress(manifest, {
		compile: (asked) => {
			calls.push({
				argumentsJson: asked.argumentsJson,
				extraLeavesJson: asked.extraLeavesJson,
				includeDebugSymbols: asked.includeDebugSymbols,
				source: asked.source,
			});

			return { address: "ex1p_recorded", scriptPubKeyHex: `5120${"00".repeat(32)}` };
		},
		...input,
		contractSources: { "./vault.simf": SOURCE },
		declaredTypes: declaredParamTypes(manifest, action),
		includeDebugSymbols: false,
		network: "liquid",
		scope: { instance: INSTANCE, params: {} },
		utxoType: "vault",
		wiring: {},
	});

	return { calls, result };
}

describe("the vault covenant", () => {
	test("is built with a count and a flag typed by its contract, not by how they look", async () => {
		const { calls, result } = await derive({ contractParamTypes: () => DECLARED });

		expect(result.ok).toBe(true);
		expect(calls[0]?.argumentsJson).toBe(
			`{"OWNER_PUB_KEY":{"type":"Pubkey","value":"0x${KEY}"},` +
				`"VAULT_ASSET_ID":{"type":"u256","value":"0x${ASSET_COMMITTED}"},` +
				`"RESERVE_COV_HASH":{"type":"u256","value":"0x${RESERVE_HASH}"},` +
				'"SLOT_COUNT":{"type":"u8","value":"2"},' +
				'"WITH_BURN":{"type":"bool","value":"false"}}',
		);
	});

	test("and from the contract source the request supplied, not one of its own", async () => {
		const { calls } = await derive({ contractParamTypes: () => DECLARED });

		expect(calls[0]?.source).toBe(SOURCE);
	});

	/**
	 * Every value here comes off the deployment. Until a class's own field declarations were read,
	 * there was no type to encode any of them against and therefore no address to compare a live
	 * deployment's funds to.
	 */
	test("reads every other parameter off the deployment, at the type the class declares", async () => {
		const { calls } = await derive({ contractParamTypes: () => DECLARED });
		const args = JSON.parse(calls[0]?.argumentsJson ?? "{}") as Record<string, unknown>;

		expect(args.OWNER_PUB_KEY).toEqual({ type: "Pubkey", value: `0x${KEY}` });
		expect(args.RESERVE_COV_HASH).toEqual({ type: "u256", value: `0x${RESERVE_HASH}` });
	});
});

describe("what it refuses rather than getting wrong", () => {
	/**
	 * The state this covenant was in before, reproduced by withholding the contract's
	 * declarations. The values are unchanged and neither is readable.
	 */
	test("the same covenant, when nothing says what the contract declares", async () => {
		const { calls, result } = await derive();

		expect(result.ok).toBe(false);
		expect(calls).toHaveLength(0);
	});

	/**
	 * A contract that will not analyse is reported the way one that will not compile is. It is the
	 * same failure found one step earlier, and saying so keeps the two from reading as different
	 * problems.
	 */
	test("a contract whose declarations cannot be read at all", async () => {
		const { calls, result } = await derive({
			contractParamTypes: () => {
				throw new Error("not a program");
			},
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("./vault.simf");
		expect(calls).toHaveLength(0);
	});

	test("a deployment missing a field the covenant is built from", async () => {
		const action = findAction(manifest, "Withdraw");
		const { RESERVE_COV_HASH: _absent, ...short } = INSTANCE;
		const result = await deriveCovenantAddress(manifest, {
			compile: () => ({ address: "ex1p", scriptPubKeyHex: "51" }),
			contractParamTypes: () => DECLARED,
			contractSources: { "./vault.simf": SOURCE },
			declaredTypes: declaredParamTypes(manifest, action!),
			includeDebugSymbols: false,
			network: "liquid",
			scope: { instance: short, params: {} },
			utxoType: "vault",
			wiring: {},
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("RESERVE_COV_HASH");
	});
});
