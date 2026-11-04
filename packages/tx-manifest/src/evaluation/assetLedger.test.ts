import { describe, expect, test } from "bun:test";

import multiassetManifest from "../__fixtures__/multiasset/txmanifest.json";
import { findAction, type NormalisedAction, normaliseManifest } from "../document/normalise";
import { refusalOf } from "../review/reviewForTests";
import { assetLedger, type HeldValue, resolveAsset } from "./assetLedger";
import { planAction } from "./plan";

const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const TOKEN = "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2";
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

const manifest = normaliseManifest(multiassetManifest as unknown as Record<string, unknown>);

function payToken(params: Record<string, unknown>) {
	const action = findAction(manifest, "PayToken");

	if (!action) {
		throw new Error("the fixture declares no PayToken");
	}

	const scope = { params };

	return { action, plan: planAction(action, scope), scope };
}

function ledgerOf(params: Record<string, unknown>, held: HeldValue[] = []) {
	const { action, plan, scope } = payToken(params);

	return assetLedger(action, plan.outputs, { held, policyAsset: POLICY_ASSET, scope });
}

const PARAMS = { amount_sat: 1000, fee_sat: 700, pubkey: PUBKEY, token: TOKEN };

describe("which asset a declared site is in", () => {
	const context = { policyAsset: POLICY_ASSET, scope: { params: {} } };

	test("nothing stated means the asset the network charges fees in", () => {
		expect(resolveAsset(undefined, "output out", context)).toBe(POLICY_ASSET);
	});

	test("a literal id stays exactly itself", () => {
		expect(resolveAsset(TOKEN, "output out", context)).toBe(TOKEN);
	});

	test("and a lookup becomes whatever the deployment or the request supplied", () => {
		expect(
			resolveAsset("instance.PRINCIPAL", "output out", {
				policyAsset: POLICY_ASSET,
				scope: { instance: { PRINCIPAL: TOKEN }, params: {} },
			}),
		).toBe(TOKEN);
	});

	test("a lookup nothing resolves is not an asset yet", () => {
		const refusal = refusalOf(() => resolveAsset("instance.PRINCIPAL", "output out", context));

		expect(refusal.reject).toBe("foreign-asset");
		expect(refusal.reason).toContain("instance.PRINCIPAL");
		expect(refusal.reason).toContain("could not establish");
	});

	test("and one that resolves to a second lookup is refused rather than chased", () => {
		const refusal = refusalOf(() =>
			resolveAsset("params.token", "output out", {
				policyAsset: POLICY_ASSET,
				scope: { params: { token: "instance.PRINCIPAL" } },
			}),
		);

		expect(refusal.reason).toContain("another lookup");
	});

	test("a literal id and a lookup resolving elsewhere stay distinct and exact", () => {
		const other = "aa".repeat(32);
		const supplied = { policyAsset: POLICY_ASSET, scope: { params: { token: other } } };

		expect(resolveAsset(TOKEN, "output one", supplied)).toBe(TOKEN);
		expect(resolveAsset("params.token", "output two", supplied)).toBe(other);
	});

	test("a lookup that resolves to the network's own asset is that asset", () => {
		expect(
			resolveAsset("params.token", "output out", {
				policyAsset: POLICY_ASSET,
				scope: { params: { token: "lbtc" } },
			}),
		).toBe(POLICY_ASSET);
	});
});

describe("reading one action as a statement about several assets", () => {
	test("keeps each asset's cost to itself rather than adding them together", () => {
		expect(ledgerOf(PARAMS).entries).toEqual([
			{
				asset: POLICY_ASSET,
				change: { blinded: false, id: "change_out" },
				held: 0n,
				needed: 700n,
			},
			{ asset: TOKEN, change: { blinded: false, id: "token_change" }, held: 0n, needed: 1000n },
		]);
	});

	test("says which asset each planned output pays in, in the plan's own order", () => {
		expect(ledgerOf(PARAMS).outputs).toEqual([TOKEN, POLICY_ASSET, TOKEN, POLICY_ASSET]);
	});

	test("and names the wallet inputs the action needs, with the asset each is in", () => {
		expect(ledgerOf(PARAMS).walletInputs).toEqual([{ asset: TOKEN, id: "token_in" }]);
	});

	test("nets what the transaction already brings, asset by asset", () => {
		const ledger = ledgerOf(PARAMS, [
			{ asset: TOKEN, id: "token_in", sats: 400n },
			{ asset: POLICY_ASSET, id: "money_in", sats: 100n },
		]);

		expect(ledger.entries).toEqual([
			{
				asset: POLICY_ASSET,
				change: { blinded: false, id: "change_out" },
				held: 100n,
				needed: 700n,
			},
			{ asset: TOKEN, change: { blinded: false, id: "token_change" }, held: 400n, needed: 1000n },
		]);
	});

	test("refuses a plan that does not line up with the outputs the document declares", () => {
		const { action, plan, scope } = payToken(PARAMS);
		const refusal = refusalOf(() =>
			assetLedger(action, plan.outputs.slice(1), { held: [], policyAsset: POLICY_ASSET, scope }),
		);

		expect(refusal.reject).toBe("document-fault");
	});

	test("and refuses an asset it cannot establish rather than assuming one", () => {
		expect(refusalOf(() => ledgerOf({ ...PARAMS, token: undefined })).reject).toBe("foreign-asset");
	});

	test("refuses a covenant input the chain says holds a different asset", () => {
		const action: NormalisedAction = {
			isConstructor: false,
			name: "Spend",
			node: {
				inputs: [{ asset: TOKEN, id: "vault_in", utxo_source: { utxo_type: "vault" } }],
				outputs: [{ amount_sat: 10, destination: "wallet", id: "out" }],
			},
		};
		const plan = planAction(action, { params: {} });
		const refusal = refusalOf(() =>
			assetLedger(action, plan.outputs, {
				held: [{ asset: POLICY_ASSET, id: "vault_in", sats: 500n }],
				policyAsset: POLICY_ASSET,
				scope: { params: {} },
			}),
		);

		expect(refusal.reject).toBe("foreign-asset");
		expect(refusal.reason).toContain("vault_in");
	});
});
