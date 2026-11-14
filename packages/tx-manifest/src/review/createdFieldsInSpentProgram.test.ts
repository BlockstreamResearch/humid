import { describe, expect, test } from "bun:test";

import { COMPILED, Fixture, POLICY_ASSET, review } from "./reviewForTests";

const lending = Fixture.load("lending_v3");

async function argumentsCompiledFor(source: string): Promise<Record<string, unknown>[]> {
	const compiled: Record<string, unknown>[] = [];

	await review(
		lending.request("CreateOffer", {
			instance: { instance: { fields: { FACTORY_ASSET_ID: "fa".repeat(32) } } },
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
		}),
		{
			compile: (asked) => {
				if (asked.source === source) {
					compiled.push(JSON.parse(asked.argumentsJson) as Record<string, unknown>);
				}

				return COMPILED;
			},
			fundingUtxos: [],
			readTxOut: async () => ({
				amountSats: "1",
				rawAssetId: "fa".repeat(32),
				scriptPubKeyHex: COMPILED.scriptPubKeyHex,
				txOutHex: "00",
			}),
		},
	);

	return compiled;
}

describe("a spent program compiled from a field of the deployment the action creates", () => {
	test("CreateOffer compiles the issuance factory from the count its create_instance states", async () => {
		const compiled = await argumentsCompiledFor(lending.source("./issuance_factory.simf"));

		expect(compiled[0]?.ISSUING_UTXOS_COUNT).toEqual({ type: "u8", value: "2" });
	});
});
