import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import manifestJson from "../__fixtures__/current/lending_v3.manifest.json";
import { findAction, normaliseManifest } from "../document/normalise";
import { buildMode } from "../document/refuse";
import { deriveCovenantAddress } from "./covenant";
import { declaredParamTypes } from "./declaredTypes";

/**
 * The covenants a live protocol wires a bare value into, built from its own published document.
 *
 * Three of its seven utxo types write a value where the other four write a name: a count of one,
 * and the words a flag is set with. A value at that position declares nothing — the position is a
 * deployment's wiring, not a list of parameters — so until the contract was asked, there was no
 * type, no encoding, no address, and no action spending or paying any of the three.
 *
 * **What this file proves and what it does not.** It proves this runtime turns the document into
 * exactly the argument strings below. That the compiler reports the types they were built from,
 * and that those strings compile, is proved against the real wasm module in
 * `adapters/smplx/valueWiredCovenant.test.ts` — this package holds no compiler by design. The
 * pinned types and the argument strings are the join, written out at both ends.
 *
 * **No address here was compared against a chain.** The document publishes a deployed
 * scriptPubKey for its factory and for none of these three, and the asset ids below are made up,
 * so what a real deployment of them is locked by is not something this can check. What is checked
 * is that the arguments are the document's own and that every one of them is typed by a
 * declaration rather than by its appearance.
 */

const here = dirname(fileURLToPath(import.meta.url));

function contract(name: string): string {
	return readFileSync(join(here, "../__fixtures__/contracts", name), "utf8");
}

/**
 * The compiler's answer for the two contracts, pinned so this file needs no compiler.
 *
 * `SimplicityHL` declares a parameter's type nowhere in its source: `param::NAME` takes the type
 * of the position it is written in, worked out by the type checker. So this is not a reading of
 * the contract text, and it could not be — it is what the compiler said, asserted again in the
 * adapter's test against the same vendored sources.
 */
const DECLARED: Record<string, Record<string, string>> = {
	"./asset_auth.simf": { ASSET_AMOUNT: "u64", ASSET_ID: "u256", WITH_ASSET_BURN: "bool" },
	"./asset_auth_vault.simf": {
		FINALIZED_VAULT_COV_HASH: "u256",
		IS_ACTIVE: "bool",
		KEEPER_AUTH_ASSET_AMOUNT: "u64",
		KEEPER_AUTH_ASSET_ID: "u256",
		SUPPLIER_AUTH_ASSET_ID: "u256",
		VAULT_ASSET_ID: "u256",
		WITH_KEEPER_ASSET_BURN: "bool",
		WITH_SUPPLIER_ASSET_BURN: "bool",
	},
};

const MIDDLE = "00".repeat(30);

/**
 * Asset ids invented for this test, and the form each is committed in.
 *
 * An id is stated one way and committed in the reverse of it, so the second column is what a
 * covenant is built from. The ends differ from each other so the turn is visible rather than
 * asserted.
 */
const BORROWER = `b0${MIDDLE}0b`;
const BORROWER_COMMITTED = `0x0b${MIDDLE}b0`;
const PRINCIPAL = `a0${MIDDLE}0a`;
const PRINCIPAL_COMMITTED = `0x0a${MIDDLE}a0`;
const LENDER = `c0${MIDDLE}0c`;
const LENDER_COMMITTED = `0x0c${MIDDLE}c0`;
const FEE_KEEPER = `d0${MIDDLE}0d`;
const FEE_KEEPER_COMMITTED = `0x0d${MIDDLE}d0`;

/** A covenant hash of nothing, which the document wires by name and is not an id. */
const ZERO_HASH = "00".repeat(32);

/** This deployment's field values, as the actions below read them back off it. */
const INSTANCE = {
	BORROWER_NFT_ASSET_ID: BORROWER,
	LENDER_NFT_ASSET_ID: LENDER,
	PRINCIPAL_ASSET_ID: PRINCIPAL,
	PROTOCOL_FEE_KEEPER_ASSET_ID: FEE_KEEPER,
	ZERO_HASH,
};

const { manifest } = normaliseManifest(manifestJson as unknown as Record<string, unknown>);

async function derive(action: string, utxoType: string, source: string) {
	const found = findAction(manifest, action);

	if (!found) {
		throw new Error(`This fixture declares no action named ${action}.`);
	}

	const calls: { argumentsJson: string; source: string }[] = [];
	const result = await deriveCovenantAddress(manifest, {
		compile: (input) => {
			calls.push(input);

			return { address: "ex1p_recorded", scriptPubKeyHex: `5120${"00".repeat(32)}` };
		},
		contractParamTypes: () => DECLARED[source] ?? {},
		contractSources: { [source]: contract(source.replace("./", "")) },
		declaredTypes: declaredParamTypes(manifest, found),
		includeDebugSymbols: buildMode(manifest),
		network: "liquid",
		scope: { instance: INSTANCE, params: {} },
		utxoType,
		wiring: {},
	});

	return { calls, result };
}

describe("the covenant behind claiming the principal", () => {
	test("is built with a count and a flag typed by its contract, not by how they look", async () => {
		const { calls, result } = await derive(
			"ClaimPrincipal",
			"principal_asset_auth",
			"./asset_auth.simf",
		);

		expect(result.ok).toBe(true);
		expect(calls[0]?.argumentsJson).toBe(
			`{"ASSET_ID":{"type":"u256","value":"${BORROWER_COMMITTED}"},` +
				'"ASSET_AMOUNT":{"type":"u64","value":"1"},' +
				'"WITH_ASSET_BURN":{"type":"bool","value":"false"}}',
		);
	});

	test("and identically from the other action that names the same covenant", async () => {
		const claim = await derive("ClaimPrincipal", "principal_asset_auth", "./asset_auth.simf");
		const accept = await derive("AcceptOffer", "principal_asset_auth", "./asset_auth.simf");

		expect(accept.result.ok).toBe(true);
		expect(accept.calls[0]?.argumentsJson).toBe(claim.calls[0]?.argumentsJson);
	});
});

describe("the covenants behind repaying and the lender's settlement", () => {
	test("the lender's finalised vault", async () => {
		const { calls, result } = await derive(
			"RepayLoan",
			"lender_vault_finalized",
			"./asset_auth_vault.simf",
		);

		expect(result.ok).toBe(true);
		expect(calls[0]?.argumentsJson).toBe(
			`{"VAULT_ASSET_ID":{"type":"u256","value":"${PRINCIPAL_COMMITTED}"},` +
				`"KEEPER_AUTH_ASSET_ID":{"type":"u256","value":"${LENDER_COMMITTED}"},` +
				`"SUPPLIER_AUTH_ASSET_ID":{"type":"u256","value":"${BORROWER_COMMITTED}"},` +
				'"KEEPER_AUTH_ASSET_AMOUNT":{"type":"u64","value":"1"},' +
				`"FINALIZED_VAULT_COV_HASH":{"type":"u256","value":"0x${ZERO_HASH}"},` +
				'"IS_ACTIVE":{"type":"bool","value":"false"},' +
				'"WITH_KEEPER_ASSET_BURN":{"type":"bool","value":"true"},' +
				'"WITH_SUPPLIER_ASSET_BURN":{"type":"bool","value":"true"}}',
		);
	});

	/**
	 * The same contract, wired differently. Its keeper burns nothing where the lender's vault
	 * burns, which is one word in the document and a different covenant at a different address —
	 * so a flag read as a flag rather than as a declared type would put the protocol's fees
	 * somewhere nobody could spend them.
	 */
	test("the protocol fee's finalised vault, which differs from it by one flag", async () => {
		const { calls, result } = await derive(
			"RepayLoan",
			"protocol_fee_vault_finalized",
			"./asset_auth_vault.simf",
		);

		expect(result.ok).toBe(true);
		expect(calls[0]?.argumentsJson).toBe(
			`{"VAULT_ASSET_ID":{"type":"u256","value":"${PRINCIPAL_COMMITTED}"},` +
				`"KEEPER_AUTH_ASSET_ID":{"type":"u256","value":"${FEE_KEEPER_COMMITTED}"},` +
				`"SUPPLIER_AUTH_ASSET_ID":{"type":"u256","value":"${BORROWER_COMMITTED}"},` +
				'"KEEPER_AUTH_ASSET_AMOUNT":{"type":"u64","value":"1"},' +
				`"FINALIZED_VAULT_COV_HASH":{"type":"u256","value":"0x${ZERO_HASH}"},` +
				'"IS_ACTIVE":{"type":"bool","value":"false"},' +
				'"WITH_KEEPER_ASSET_BURN":{"type":"bool","value":"false"},' +
				'"WITH_SUPPLIER_ASSET_BURN":{"type":"bool","value":"true"}}',
		);
	});
});

describe("what it still refuses rather than getting wrong", () => {
	/**
	 * The state every one of these was in before, reproduced by withholding the contract. The
	 * values are unchanged and none of them is readable: `1` is not a number until something
	 * says at what width, and a width is part of the address.
	 */
	test("all three, when nothing says what the contract declares", async () => {
		const results = await Promise.all(
			(
				[
					["ClaimPrincipal", "principal_asset_auth", "./asset_auth.simf"],
					["RepayLoan", "lender_vault_finalized", "./asset_auth_vault.simf"],
					["RepayLoan", "protocol_fee_vault_finalized", "./asset_auth_vault.simf"],
				] as const
			).map(([action, utxoType, source]) => {
				const found = findAction(manifest, action);

				if (!found) {
					throw new Error(`This fixture declares no action named ${action}.`);
				}

				return deriveCovenantAddress(manifest, {
					compile: () => ({ address: "ex1p", scriptPubKeyHex: "51" }),
					contractSources: { [source]: contract(source.replace("./", "")) },
					declaredTypes: declaredParamTypes(manifest, found),
					includeDebugSymbols: buildMode(manifest),
					network: "liquid",
					scope: { instance: INSTANCE, params: {} },
					utxoType,
					wiring: {},
				});
			}),
		);

		expect(results.map((result) => result.ok)).toEqual([false, false, false]);
	});

	/**
	 * A contract that will not analyse is reported the way one that will not compile is. It is
	 * the same failure found one step earlier, and saying so keeps the two from reading as
	 * different problems.
	 */
	test("a contract whose declarations cannot be read at all", async () => {
		const found = findAction(manifest, "ClaimPrincipal");
		const result = await deriveCovenantAddress(manifest, {
			compile: () => ({ address: "ex1p", scriptPubKeyHex: "51" }),
			contractParamTypes: () => {
				throw new Error("not a program");
			},
			contractSources: { "./asset_auth.simf": contract("asset_auth.simf") },
			declaredTypes: declaredParamTypes(manifest, found!),
			includeDebugSymbols: buildMode(manifest),
			network: "liquid",
			scope: { instance: INSTANCE, params: {} },
			utxoType: "principal_asset_auth",
			wiring: {},
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("./asset_auth.simf");
	});
});
