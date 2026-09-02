import { describe, expect, test } from "bun:test";

import multiassetManifest from "../__fixtures__/multiasset.manifest.json";
import { findAction, type NormalisedAction, normaliseManifest } from "../document/normalise";
import { assetLedger, type HeldValue, resolveAsset } from "./assetLedger";
import { planAction } from "./plan";

const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const TOKEN = "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2";
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

const { manifest } = normaliseManifest(multiassetManifest as unknown as Record<string, unknown>);

function payToken(params: Record<string, unknown>) {
	const action = findAction(manifest, "PayToken");

	if (!action) {
		throw new Error("the fixture declares no PayToken");
	}

	const scope = { params };
	const plan = planAction(action, scope);

	if (!plan.ok) {
		throw new Error(plan.reason);
	}

	return { action, plan: plan.plan, scope };
}

function ledgerOf(params: Record<string, unknown>, held: HeldValue[] = []) {
	const { action, plan, scope } = payToken(params);

	return assetLedger(action, plan.outputs, { held, policyAsset: POLICY_ASSET, scope });
}

const PARAMS = { amount_sat: 1000, fee_sat: 700, pubkey: PUBKEY, token: TOKEN };

describe("which asset a declared site is in", () => {
	const context = { policyAsset: POLICY_ASSET, scope: { params: {} } };

	// A site that says nothing is paying in the one asset every reader of the document already
	// shares, which is the one the network charges its fees in.
	test("nothing stated means the asset the network charges fees in", () => {
		expect(resolveAsset(undefined, "output out", context)).toEqual({
			id: POLICY_ASSET,
			ok: true,
		});
	});

	test("a literal id stays exactly itself", () => {
		expect(resolveAsset(TOKEN, "output out", context)).toEqual({ id: TOKEN, ok: true });
	});

	test("and a lookup becomes whatever the deployment or the request supplied", () => {
		expect(
			resolveAsset("instance.PRINCIPAL", "output out", {
				policyAsset: POLICY_ASSET,
				scope: { instance: { PRINCIPAL: TOKEN }, params: {} },
			}),
		).toEqual({ id: TOKEN, ok: true });
	});

	// Not knowing what is being paid in is exactly the moment not to pay.
	test("a lookup nothing resolves is not an asset yet", () => {
		const resolved = resolveAsset("instance.PRINCIPAL", "output out", context);

		expect(resolved.ok).toBe(false);
		expect(resolved.ok ? "" : resolved.reason).toContain("instance.PRINCIPAL");
		expect(resolved.ok ? "" : resolved.reason).toContain("could not establish");
	});

	test("and one that resolves to a second lookup is refused rather than chased", () => {
		const resolved = resolveAsset("params.token", "output out", {
			policyAsset: POLICY_ASSET,
			scope: { params: { token: "instance.PRINCIPAL" } },
		});

		expect(resolved.ok).toBe(false);
		expect(resolved.ok ? "" : resolved.reason).toContain("another lookup");
	});

	/**
	 * A literal id and a lookup are different statements, and they stay different.
	 *
	 * The corpus states an asset as a lookup far more often than as an id, so the two meet
	 * constantly — and a runtime that read one as the other would be answering a question
	 * about the spelling rather than about the money.
	 */
	test("a literal id and a lookup resolving elsewhere stay distinct and exact", () => {
		const other = "aa".repeat(32);
		const supplied = { policyAsset: POLICY_ASSET, scope: { params: { token: other } } };

		expect(resolveAsset(TOKEN, "output one", supplied)).toEqual({ id: TOKEN, ok: true });
		expect(resolveAsset("params.token", "output two", supplied)).toEqual({ id: other, ok: true });
	});

	// The keyword and the id are the same asset, whichever the lookup lands on.
	test("a lookup that resolves to the network's own asset is that asset", () => {
		expect(
			resolveAsset("params.token", "output out", {
				policyAsset: POLICY_ASSET,
				scope: { params: { token: "lbtc" } },
			}),
		).toEqual({ id: POLICY_ASSET, ok: true });
	});
});

describe("reading one action as a statement about several assets", () => {
	test("keeps each asset's cost to itself rather than adding them together", () => {
		const result = ledgerOf(PARAMS);

		expect(result.ok).toBe(true);

		if (result.ok) {
			expect(result.ledger.entries).toEqual([
				// The network's own asset is always part of the reckoning, whether or not the
				// action mentions it: the fee is paid in it and the wallet pays the fee.
				{
					asset: POLICY_ASSET,
					change: { blinded: false, id: "change_out" },
					held: 0n,
					needed: 700n,
				},
				{ asset: TOKEN, change: { blinded: false, id: "token_change" }, held: 0n, needed: 1000n },
			]);
		}
	});

	test("says which asset each planned output pays in, in the plan's own order", () => {
		const result = ledgerOf(PARAMS);

		expect(result.ok ? result.ledger.outputs : []).toEqual([
			TOKEN,
			POLICY_ASSET,
			TOKEN,
			POLICY_ASSET,
		]);
	});

	test("and names the wallet inputs the action needs, with the asset each is in", () => {
		const result = ledgerOf(PARAMS);

		expect(result.ok ? result.ledger.walletInputs : []).toEqual([{ asset: TOKEN, id: "token_in" }]);
	});

	// What a covenant already holds is netted against what the outputs cost — within one asset
	// and never across two.
	test("nets what the transaction already brings, asset by asset", () => {
		const result = ledgerOf(PARAMS, [
			{ asset: TOKEN, id: "token_in", sats: 400n },
			{ asset: POLICY_ASSET, id: "money_in", sats: 100n },
		]);

		expect(result.ok ? result.ledger.entries : []).toEqual([
			{
				asset: POLICY_ASSET,
				change: { blinded: false, id: "change_out" },
				held: 100n,
				needed: 700n,
			},
			{ asset: TOKEN, change: { blinded: false, id: "token_change" }, held: 400n, needed: 1000n },
		]);
	});

	// A plan that ever stopped lining up with the document is refused here, rather than
	// silently attributing an amount to the wrong asset.
	test("refuses a plan that does not line up with the outputs the document declares", () => {
		const { action, plan, scope } = payToken(PARAMS);
		const result = assetLedger(action, plan.outputs.slice(1), {
			held: [],
			policyAsset: POLICY_ASSET,
			scope,
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reject).toBe("document-fault");
	});

	test("and refuses an asset it cannot establish rather than assuming one", () => {
		const result = ledgerOf({ ...PARAMS, token: undefined });

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reject).toBe("foreign-asset");
	});

	/**
	 * The check that keeps a document's word about a covenant honest.
	 *
	 * A covenant input's asset is whatever the chain says is at that outpoint. The document
	 * states one too, and the two disagreeing means the covenant is not holding what the
	 * action says it holds — which would fund the stated asset and strand the real one.
	 */
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

		if (!plan.ok) {
			throw new Error(plan.reason);
		}

		const result = assetLedger(action, plan.plan.outputs, {
			held: [{ asset: POLICY_ASSET, id: "vault_in", sats: 500n }],
			policyAsset: POLICY_ASSET,
			scope: { params: {} },
		});

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("vault_in");
	});
});
