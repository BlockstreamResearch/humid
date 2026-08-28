import { describe, expect, test } from "bun:test";

import dexManifest from "../__fixtures__/current/dex.manifest.json";
import lastWillManifest from "../__fixtures__/current/last_will.manifest.json";
import lendingManifest from "../__fixtures__/current/lending_v3.manifest.json";
import { isRefusal, reviewManifestAction } from "./index";

/**
 * An action that brings a deployment into existence, reviewed end to end.
 *
 * Everything else this package does starts from a contract that already exists: the wallet
 * rebuilds it, reads what is at its outpoint, and refuses when the two disagree. A constructor
 * has none of that. There is no deployment to read its fields from, nothing on chain to compare
 * a derived address against, and — where the action issues an asset — half the deployment's
 * fields are functions of an output the wallet has not chosen yet.
 *
 * Three published protocols declare a constructor and all three are exercised here, because the
 * point is a rule of the format rather than an accommodation for one document.
 *
 * The contracts are compiled by a substitute, as everywhere in this package. What the real
 * compiler makes of the same deployment is `adapters/smplx/createdDeployment.test.ts`.
 */

const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;
const FUNDING = [
	{ amount: "100000000", spendable: true, txid: "1".repeat(64), txOut: "00", vout: 0 },
];

/** Every contract path a document names, stubbed — no case here needs a real compiler. */
function sourcesOf(document: unknown): Record<string, string> {
	const paths = new Set<string>();

	JSON.stringify(document, (key, value) =>
		(key === "source" || key === "simf") && typeof value === "string"
			? (paths.add(value), value)
			: value,
	);

	return Object.fromEntries([...paths].map((path) => [path, `fn main() { ${path} }`]));
}

async function review(document: unknown, action: string, params: Record<string, unknown>) {
	return reviewManifestAction(
		{
			action,
			broadcast: false,
			contractSources: sourcesOf(document),
			manifest: document as Record<string, unknown>,
			params,
		} as never,
		{
			accountLabel: "liquid account 0",
			compile: () => ({ address: "ex1p_derived", scriptPubKeyHex: DERIVED_SCRIPT }),
			compilerVersion: "0.6.0",
			fundingUtxos: FUNDING,
			holdingsOf: () => FUNDING,
			network: "liquid",
			policyAsset: POLICY_ASSET,
			readFeeRate: async () => 1000,
			readTxOut: async () => ({
				amountSats: "1",
				rawAssetId: POLICY_ASSET,
				scriptPubKeyHex: DERIVED_SCRIPT,
				txOutHex: "00",
			}),
			scriptPubKeyOf: () => DERIVED_SCRIPT,
			walletScriptPubKeyHex: `0014${"11".repeat(20)}`,
		} as never,
	);
}

describe("an action that creates a deployment", () => {
	test("reviews with no deployment to read, and reports the one it creates", async () => {
		const result = await review(lastWillManifest, "Fund", {
			COLD_PUB_KEY: PUBKEY,
			HOT_PUB_KEY: PUBKEY,
			INHERITOR_PUB_KEY: PUBKEY,
			amount_sat: 100_000,
		});

		expect(isRefusal(result)).toBe(false);

		if (isRefusal(result)) {
			return;
		}

		// Every field of the new deployment, including the one nobody typed: the document states
		// a default and the deployment records what the default came to.
		expect(result.createdInstance?.fields).toEqual({
			COLD_PUB_KEY: PUBKEY,
			HOT_PUB_KEY: PUBKEY,
			INHERIT_BLOCKS: "25920",
			INHERITOR_PUB_KEY: PUBKEY,
		});
	});

	/**
	 * What a person is shown for a contract with no history.
	 *
	 * Not "unverified", which is what a check that failed would be, and not "verified", which
	 * would claim a comparison nobody could make. The wallet derived the address itself from the
	 * contract source and the deployment it just worked out — that is the whole protection here,
	 * and saying so is different from saying a check passed.
	 */
	test("reports a covenant it creates as one with nothing yet to compare against", async () => {
		const result = await review(lastWillManifest, "Fund", {
			COLD_PUB_KEY: PUBKEY,
			HOT_PUB_KEY: PUBKEY,
			INHERITOR_PUB_KEY: PUBKEY,
			amount_sat: 100_000,
		});

		expect(isRefusal(result) ? [] : result.covenants).toEqual([
			{
				address: "ex1p_derived",
				role: "created",
				scriptPubKeyHex: DERIVED_SCRIPT,
				utxoType: "last_will",
				verified: "not-yet-on-chain",
			},
		]);
	});

	test("works out a deployment field the document computes from the rest", async () => {
		const result = await review(dexManifest, "MakeOffer", {
			AMOUNT_B: "5000",
			ASSET_B: "b".repeat(64),
			MAKER_PUB_KEY: PUBKEY,
			OFFER_AMOUNT: "1000",
			OFFER_ASSET_ID: POLICY_ASSET,
			TIMEOUT: "900000",
		});

		expect(isRefusal(result)).toBe(false);

		if (isRefusal(result)) {
			return;
		}

		// A covenant hash, which is the one field of this deployment nothing could supply.
		expect(result.createdInstance?.fields.MAKER_SPK).toHaveLength(64);
		expect(result.createdInstance?.rounds).toBeGreaterThan(0);
	});

	test("carries no deployment for an action that only spends what exists", async () => {
		const result = await review(dexManifest, "MakeOffer", {
			AMOUNT_B: "5000",
			ASSET_B: "b".repeat(64),
			MAKER_PUB_KEY: PUBKEY,
			OFFER_AMOUNT: "1000",
			OFFER_ASSET_ID: POLICY_ASSET,
			TIMEOUT: "900000",
		});
		const spending = await review(lastWillManifest, "Refresh", {});

		expect(isRefusal(result) ? undefined : result.createdInstance).toBeDefined();
		expect(isRefusal(spending) ? undefined : spending.createdInstance).toBeUndefined();
	});
});

/**
 * The ordering this needed, stated against the document that needs it.
 *
 * The factory's own creation reads a field of the deployment it is creating, and that field is
 * the asset the action itself issues — so it cannot exist until the transaction does. Working
 * the deployment out before the inputs were resolved refused it outright. The action still stops
 * further on, and this pins where: a metadata part naming a value in the deployment namespace
 * that no class in the document declares as a field. That is the document's own error, and it
 * is the only one of its kind in the seven published manifests.
 */
describe("a deployment whose fields the action's own issuance produces", () => {
	test("is no longer refused for a field the transaction had not created yet", async () => {
		const result = await review(lendingManifest, "CreateFactory", {});

		expect(isRefusal(result)).toBe(true);

		if (!isRefusal(result)) {
			return;
		}

		expect(result.reason).not.toContain("Field FACTORY_ASSET_ID");
		expect(result.reason).toContain('instance carries no "FACTORY_PROGRAM_ID"');
	});
});
