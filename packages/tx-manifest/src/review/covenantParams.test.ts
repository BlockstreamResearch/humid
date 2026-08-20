import { describe, expect, test } from "bun:test";

import dexManifest from "../__fixtures__/current/dex.manifest.json";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { isRefusal, reviewManifestAction } from "./index";

/**
 * A published protocol whose covenants are parameterised by asset ids and amounts, reviewed.
 *
 * The swap in `dex.manifest.json` is the corpus's clearest case of the two positions a
 * covenant's parameters can be declared at. `MakeOffer` takes the offer's terms as its own
 * parameters and locks them into a covenant. `Settle` takes no parameters at all and compiles
 * the same covenant out of the deployment `MakeOffer` created. Until the types at both
 * positions could be read and encoded, the first was refused for a type nobody had mapped and
 * the second for a name nobody could resolve — so neither action reviewed end to end, and no
 * address existed to compare against the chain.
 *
 * The contracts are compiled by a substitute here. This protocol's sources are not published
 * alongside it — in production they arrive with the request — so what an address of it comes
 * out as cannot be checked against anything. What is checked is what the compiler is asked
 * for. A covenant whose address is checked against a value the chain holds is
 * `covenants/deployedCovenant.test.ts` and its other half in the wallet's smplx adapter.
 */

const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const ASSET_A = "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec8ef5b4d5";
const ASSET_B = "aa0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec8ef5b4d5";
const MAKER_KEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const MAKER_SPK_HASH = "cc".repeat(32);
const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;
const WALLET_SCRIPT = `0014${"11".repeat(20)}`;

const SOURCES = {
	"./maker_payout.simf": "fn main() { }",
	"./tessera.simf": "fn main() { }",
};

/** The offer's terms, as `MakeOffer` declares them and as the deployment records them. */
const TERMS = {
	AMOUNT_B: "500",
	ASSET_B,
	MAKER_PUB_KEY: MAKER_KEY,
	MAX_FEE: "5000",
	OFFER_AMOUNT: "1000",
	OFFER_ASSET_ID: ASSET_A,
	TIMEOUT: "900000",
};

function settle(request: ParsedLiquidProcessCtParams) {
	const compiled: { argumentsJson: string; source: string }[] = [];
	const holdings = [
		{ amount: "100000000", spendable: true, txid: "1".repeat(64), txOut: "00", vout: 0 },
	];

	return {
		compiled,
		review: reviewManifestAction(request, {
			accountLabel: "liquid:testnet account 0",
			compile: (input) => {
				compiled.push({ argumentsJson: input.argumentsJson, source: input.source });

				return { address: "ex1p_derived", scriptPubKeyHex: DERIVED_SCRIPT };
			},
			compilerVersion: "0.6.0",
			fundingUtxos: holdings,
			holdingsOf: () => holdings,
			network: "liquid",
			policyAsset: POLICY_ASSET,
			readFeeRate: async () => 1000,
			readTxOut: async () => ({
				amountSats: "1000",
				rawAssetId: ASSET_A,
				scriptPubKeyHex: DERIVED_SCRIPT,
				txOutHex: "00",
			}),
			scriptPubKeyOf: () => DERIVED_SCRIPT,
			walletScriptPubKeyHex: WALLET_SCRIPT,
		}),
	};
}

/** Every argument the wiring named, flattened out of whichever compile carried it. */
function argumentFor(calls: { argumentsJson: string }[], name: string): unknown {
	for (const call of calls) {
		const parsed = JSON.parse(call.argumentsJson) as Record<string, unknown>;

		if (name in parsed) {
			return parsed[name];
		}
	}

	return undefined;
}

describe("an offer whose terms the request supplies", () => {
	const request = {
		action: "MakeOffer",
		broadcast: false,
		contractSources: SOURCES,
		manifest: dexManifest as unknown as Record<string, unknown>,
		params: TERMS,
	} as unknown as ParsedLiquidProcessCtParams;

	test("is reviewed rather than refused for a type nobody mapped", async () => {
		const { review } = settle(request);

		expect(isRefusal(await review)).toBe(false);
	});

	test("and its covenant is built from the terms, each at the width it was declared", async () => {
		const { compiled, review } = settle(request);

		await review;

		expect(argumentFor(compiled, "AMOUNT_B")).toEqual({ type: "u64", value: "500" });
		expect(argumentFor(compiled, "TIMEOUT")).toEqual({ type: "u32", value: "900000" });
		expect(argumentFor(compiled, "MAX_FEE")).toEqual({ type: "u64", value: "5000" });
	});

	test("with the asset it wants paid in turned round the way a covenant reads one", async () => {
		const { compiled, review } = settle(request);

		await review;

		const committed = (ASSET_B.match(/../g) ?? []).toReversed().join("");

		expect(argumentFor(compiled, "ASSET_B")).toEqual({ type: "u256", value: `0x${committed}` });
	});
});

describe("the same offer, filled by someone who supplies nothing", () => {
	const request = {
		action: "Settle",
		broadcast: false,
		contractSources: SOURCES,
		instance: {
			instance: {
				class: "tessera_offer_contract",
				fields: { ...TERMS, MAKER_SPK: MAKER_SPK_HASH },
			},
		},
		manifest: dexManifest as unknown as Record<string, unknown>,
		params: {},
		state: { utxos: [{ txid: "b".repeat(64), utxo_type: "tessera_offer", vout: 0 }] },
	} as unknown as ParsedLiquidProcessCtParams;

	test("is reviewed, where before no name in its wiring could be resolved", async () => {
		const { review } = settle(request);

		expect(isRefusal(await review)).toBe(false);
	});

	test("and rebuilds the offer covenant from the deployment's own fields", async () => {
		const { compiled, review } = settle(request);

		await review;

		expect(argumentFor(compiled, "AMOUNT_B")).toEqual({ type: "u64", value: "500" });
		expect(argumentFor(compiled, "MAKER_SPK")).toEqual({
			type: "u256",
			value: `0x${MAKER_SPK_HASH}`,
		});
		expect(argumentFor(compiled, "TIMEOUT")).toEqual({ type: "u32", value: "900000" });
	});

	/**
	 * The maker's payout covenant is a second one in the same action, wired to a key rather
	 * than to the terms. It is here because the two are compiled in the order the document
	 * declares them, and an action that only worked for its first covenant would still look
	 * like it worked.
	 */
	test("and the maker's payout covenant beside it, from the key the deployment records", async () => {
		const { compiled, review } = settle(request);

		await review;

		expect(compiled.length).toBeGreaterThan(1);
		expect(argumentFor(compiled, "PUB_KEY")).toEqual({
			type: "Pubkey",
			value: `0x${MAKER_KEY}`,
		});
	});
});

describe("what it still refuses", () => {
	test("an amount too large for the width the document declared it at", async () => {
		const { review } = settle({
			action: "MakeOffer",
			broadcast: false,
			contractSources: SOURCES,
			manifest: dexManifest as unknown as Record<string, unknown>,
			params: { ...TERMS, TIMEOUT: "4294967296" },
		} as unknown as ParsedLiquidProcessCtParams);

		const result = await review;

		expect(isRefusal(result)).toBe(true);
		expect(isRefusal(result) ? result.reason : "").toContain("0 to 4294967295");
	});

	test("an asset id that is not thirty-two bytes, before any address is derived", async () => {
		const { compiled, review } = settle({
			action: "MakeOffer",
			broadcast: false,
			contractSources: SOURCES,
			manifest: dexManifest as unknown as Record<string, unknown>,
			params: { ...TERMS, ASSET_B: "6f0279e9" },
		} as unknown as ParsedLiquidProcessCtParams);

		expect(isRefusal(await review)).toBe(true);
		expect(compiled).toHaveLength(0);
	});
});
