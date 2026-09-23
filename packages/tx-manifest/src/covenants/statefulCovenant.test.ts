import { describe, expect, test } from "bun:test";

import manifestJson from "../__fixtures__/current/lending_v3.manifest.json";
import { normaliseManifest } from "../document/normalise";
import { deriveCovenantAddress } from "./covenant";

const { manifest } = normaliseManifest(manifestJson as unknown as Record<string, unknown>);

const CURRENT_DEBT = "1000";

const INSTANCE: Record<string, string> = {
	BORROWER_NFT_ASSET_ID: `b0${"00".repeat(30)}0b`,
	COLLATERAL_AMOUNT: "100000",
	COLLATERAL_ASSET_ID: `a0${"00".repeat(30)}0a`,
	CURRENT_DEBT,
	FINALIZED_LENDER_VAULT_COV_HASH: "f2".repeat(32),
	FINALIZED_PROTOCOL_FEE_VAULT_COV_HASH: "f4".repeat(32),
	LENDER_NFT_ASSET_ID: `c0${"00".repeat(30)}0c`,
	LENDER_VAULT_COV_HASH: "f1".repeat(32),
	LOAN_EXPIRATION_TIME: "900000",
	PRINCIPAL_AMOUNT: "50000",
	PRINCIPAL_ASSET_ID: `d0${"00".repeat(30)}0d`,
	PRINCIPAL_INTEREST_RATE: "500",
	PRINCIPAL_OUTPUT_SCRIPT_HASH: "aa".repeat(32),
	PROTOCOL_FEE_VAULT_COV_HASH: "f3".repeat(32),
};

const DECLARED: Record<string, string> = {
	BORROWER_NFT_ASSET_ID: "liquid.asset_id",
	COLLATERAL_AMOUNT: "u64",
	COLLATERAL_ASSET_ID: "liquid.asset_id",
	CURRENT_DEBT: "u64",
	FINALIZED_LENDER_VAULT_COV_HASH: "bytes32",
	FINALIZED_PROTOCOL_FEE_VAULT_COV_HASH: "bytes32",
	LENDER_NFT_ASSET_ID: "liquid.asset_id",
	LENDER_VAULT_COV_HASH: "bytes32",
	LOAN_EXPIRATION_TIME: "u32",
	PRINCIPAL_AMOUNT: "u64",
	PRINCIPAL_ASSET_ID: "liquid.asset_id",
	PRINCIPAL_INTEREST_RATE: "u64",
	PRINCIPAL_OUTPUT_SCRIPT_HASH: "bytes32",
	PROTOCOL_FEE_VAULT_COV_HASH: "bytes32",
};

async function leavesOf(utxoType: string, instance: Record<string, string> = INSTANCE) {
	const seen: string[] = [];
	const result = await deriveCovenantAddress(manifest, {
		compile: (asked) => {
			seen.push(asked.extraLeavesJson);

			return {
				address: "tex1p_recorded",
				cmr: "cc".repeat(32),
				scriptPubKeyHex: `5120${"00".repeat(32)}`,
				tapleafHash: "1e".repeat(32),
			};
		},
		contractSources: { "./lending.simf": "fn main() { }" },
		declaredTypes: DECLARED,
		includeDebugSymbols: false,
		network: "liquidtestnet",
		scope: { instance, params: {} },
		utxoType,
		wiring: {},
	});

	return { result, seen };
}

describe("a contract whose address commits to its state", () => {
	test("encodes the state it declares rather than refusing to derive at all", async () => {
		const { result } = await leavesOf("lending_collateral");

		expect(result.ok).toBe(true);
	});

	test("hands the compiler one leaf per state value, each of them a full leaf wide", async () => {
		const { seen } = await leavesOf("lending_collateral");
		const leaves = JSON.parse(seen[0] ?? "[]") as string[];

		expect(leaves).toHaveLength(2);
		expect(leaves.every((leaf) => leaf.length === 64)).toBe(true);
	});

	test("reads the debt through the deployment, at the width and order stated", async () => {
		const { seen } = await leavesOf("lending_collateral");
		const leaves = JSON.parse(seen[0] ?? "[]") as string[];

		expect(leaves[1]).toBe(`${"00".repeat(24)}00000000000003e8`);
	});

	test("so a different debt is a different leaf, and a different address", async () => {
		const { seen } = await leavesOf("lending_collateral", { ...INSTANCE, CURRENT_DEBT: "600" });
		const leaves = JSON.parse(seen[0] ?? "[]") as string[];

		expect(leaves[1]).toBe(`${"00".repeat(24)}0000000000000258`);
	});

	test("and the taken-up type differs from the offered one in exactly that byte", async () => {
		const offered = JSON.parse((await leavesOf("lending_collateral")).seen[0] ?? "[]") as string[];
		const active = JSON.parse(
			(await leavesOf("lending_collateral_active")).seen[0] ?? "[]",
		) as string[];

		expect(offered[0]).toBe("00".repeat(32));
		expect(active[0]).toBe(`${"00".repeat(31)}01`);
		expect(offered[1]).toBe(active[1]);
	});

	test("a debt too large for the width it is declared at is refused, not truncated", async () => {
		const { result } = await leavesOf("lending_collateral", {
			...INSTANCE,
			CURRENT_DEBT: "18446744073709551616",
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("does not fit");
	});
});
