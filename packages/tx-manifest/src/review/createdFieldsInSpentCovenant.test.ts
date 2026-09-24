import { describe, expect, test } from "bun:test";

import manifest from "../__fixtures__/current/lending_v3.manifest.json";
import { reviewManifestAction } from "./index";

const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const SCRIPT = `5120${"11".repeat(32)}`;

const contractSources = Object.fromEntries(
	[...JSON.stringify(manifest).matchAll(/"(\.\/[a-z_]+\.simf)"/g)].map(([, path]) => [
		path,
		`// ${path}`,
	]),
);

async function argumentsCompiledFor(source: string): Promise<Record<string, unknown>[]> {
	const compiled: Record<string, unknown>[] = [];

	await reviewManifestAction(
		{
			action: "CreateOffer",
			broadcast: false,
			contractSources,
			instance: { instance: { fields: { FACTORY_ASSET_ID: "fa".repeat(32) } } },
			manifest,
			params: {
				COLLATERAL_AMOUNT: "30000",
				COLLATERAL_ASSET_ID: POLICY_ASSET,
				FACTORY_ASSET_ID: "fa".repeat(32),
				LOAN_EXPIRATION_TIME: "2700000",
				PRINCIPAL_AMOUNT: "100000",
				PRINCIPAL_ASSET_ID: "d7".repeat(32),
				PRINCIPAL_INTEREST_RATE: "500",
				PROTOCOL_FEE_KEEPER_ASSET_ID: "38".repeat(32),
			},
			state: { utxos: [{ txid: "b".repeat(64), utxo_type: "issuance_factory", vout: 0 }] },
		} as never,
		{
			accountLabel: "liquid:testnet account 0",
			compile: (asked: { argumentsJson: string; source: string }) => {
				if (asked.source === source) {
					compiled.push(JSON.parse(asked.argumentsJson) as Record<string, unknown>);
				}

				return {
					address: "tex1p_recorded",
					cmr: "cc".repeat(32),
					scriptPubKeyHex: SCRIPT,
					tapleafHash: "1e".repeat(32),
				};
			},
			fundingUtxos: [],
			network: "liquidtestnet",
			policyAsset: POLICY_ASSET,
			readFeeRate: async () => 1000,
			readTxOut: async () => ({
				amountSats: "1",
				rawAssetId: "fa".repeat(32),
				scriptPubKeyHex: SCRIPT,
				txOutHex: "00",
			}),
			scriptPubKeyOf: () => SCRIPT,
			walletScriptPubKeyHex: `0014${"33".repeat(20)}`,
		} as never,
	);

	return compiled;
}

describe("a spent covenant compiled from a field of the deployment the action creates", () => {
	test("CreateOffer compiles the issuance factory from the count its create_instance states", async () => {
		const compiled = await argumentsCompiledFor("// ./issuance_factory.simf");

		expect(compiled[0]?.ISSUING_UTXOS_COUNT).toEqual({ type: "u8", value: "2" });
	});
});
