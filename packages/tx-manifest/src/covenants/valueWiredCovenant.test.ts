import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import manifestJson from "../__fixtures__/vaultlet/txmanifest.json";
import { Manifest } from "../document/manifest";
import type { ReferenceScope } from "../document/references";
import { Refusal } from "../refusal";
import { type CovenantParamTypesOf, deriveCovenantAddress } from "./covenant";
import { declaredParamTypes } from "./declaredTypes";

const KEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const ASSET_STATED = `a0${"00".repeat(30)}0a`;
const ASSET_COMMITTED = `0a${"00".repeat(30)}a0`;
const RESERVE_HASH = "cc".repeat(32);

const INSTANCE = {
	OWNER_PUB_KEY: KEY,
	RESERVE_COV_HASH: RESERVE_HASH,
	TIMEOUT: "900000",
	VAULT_AMOUNT: "50000",
	VAULT_ASSET_ID: ASSET_STATED,
};

const DECLARED = { SLOT_COUNT: "u8", WITH_BURN: "bool" };

const SOURCE = readFileSync(
	new URL("../__fixtures__/vaultlet/vault.simf", import.meta.url),
	"utf8",
);

const manifest = new Manifest(manifestJson as unknown as Record<string, unknown>);

function derive(input: { covenantParamTypes?: CovenantParamTypesOf; scope?: ReferenceScope } = {}) {
	const action = manifest.action("Withdraw");

	if (!action) {
		throw new Error("This fixture declares no action named Withdraw.");
	}

	const calls: { argumentsJson: string; source: string }[] = [];
	const derived = deriveCovenantAddress(manifest, {
		compile: ({ argumentsJson, source }) => {
			calls.push({ argumentsJson, source });

			return {
				address: "ex1p_recorded",
				cmr: "cc".repeat(32),
				scriptPubKeyHex: `5120${"00".repeat(32)}`,
				tapleafHash: "1e".repeat(32),
			};
		},
		...(input.covenantParamTypes === undefined
			? {}
			: { covenantParamTypes: input.covenantParamTypes }),
		contractSources: { "./vault.simf": SOURCE },
		declaredTypes: declaredParamTypes(manifest, action),
		includeDebugSymbols: false,
		network: "liquid",
		scope: input.scope ?? { instance: INSTANCE, params: {} },
		utxoType: "vault",
		wiring: {},
	});

	return { calls, derived };
}

describe("the vault covenant", () => {
	test("is built with a count and a flag typed by its contract, not by how they look", async () => {
		const { calls, derived } = derive({ covenantParamTypes: () => DECLARED });

		await derived;

		expect(calls[0]?.argumentsJson).toBe(
			`{"OWNER_PUB_KEY":{"type":"Pubkey","value":"0x${KEY}"},` +
				`"VAULT_ASSET_ID":{"type":"u256","value":"0x${ASSET_COMMITTED}"},` +
				`"RESERVE_COV_HASH":{"type":"u256","value":"0x${RESERVE_HASH}"},` +
				'"SLOT_COUNT":{"type":"u8","value":"2"},' +
				'"WITH_BURN":{"type":"bool","value":"false"}}',
		);
	});

	test("and from the contract source the request supplied, not one of its own", async () => {
		const { calls, derived } = derive({ covenantParamTypes: () => DECLARED });

		await derived;

		expect(calls[0]?.source).toBe(SOURCE);
	});
});

describe("what it refuses rather than getting wrong", () => {
	test("the same covenant, when nothing says what the contract declares", async () => {
		const { calls, derived } = derive();

		await expect(derived).rejects.toThrow(Refusal);
		expect(calls).toHaveLength(0);
	});

	test("a contract whose declarations cannot be read at all", async () => {
		const { calls, derived } = derive({
			covenantParamTypes: () => {
				throw new Error("not a program");
			},
		});

		await expect(derived).rejects.toThrow("./vault.simf");
		expect(calls).toHaveLength(0);
	});

	test("a deployment missing a field the covenant is built from", async () => {
		const { RESERVE_COV_HASH: _absent, ...short } = INSTANCE;
		const { derived } = derive({
			covenantParamTypes: () => DECLARED,
			scope: { instance: short, params: {} },
		});

		await expect(derived).rejects.toThrow("RESERVE_COV_HASH");
	});
});
