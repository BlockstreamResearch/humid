import { describe, expect, test } from "bun:test";

import dexManifest from "../__fixtures__/current/dex.manifest.json";
import lendingManifest from "../__fixtures__/current/lending_v3.manifest.json";
import { findAction, normaliseManifest } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { assetLedger, type HeldValue, resolveAsset } from "./assetLedger";
import { planAction } from "./plan";

const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";

describe("which asset a document is talking about", () => {
	const context = { policyAsset: POLICY_ASSET, scope: { params: {} } };

	test("the network's own asset, under either spelling the corpus uses", () => {
		expect(resolveAsset("lbtc", "output out", context)).toEqual({ id: POLICY_ASSET, ok: true });
		expect(resolveAsset(POLICY_ASSET.toUpperCase(), "output out", context)).toEqual({
			id: POLICY_ASSET,
			ok: true,
		});
	});

	// An output that says nothing about its asset is paying in the one asset every reader of the
	// document already shares, which is the one the network charges its fees in.
	test("and the same when a site states none at all", () => {
		expect(resolveAsset(undefined, "output out", context)).toEqual({
			id: POLICY_ASSET,
			ok: true,
		});
	});

	test("a lookup, once the deployment supplies it", () => {
		expect(
			resolveAsset("instance.PRINCIPAL", "output out", {
				policyAsset: POLICY_ASSET,
				scope: { instance: { PRINCIPAL: "aa".repeat(32) }, params: {} },
			}),
		).toEqual({ id: "aa".repeat(32), ok: true });
	});

	// Not knowing what is being paid in is exactly the moment not to pay, so this stays a
	// refusal and stays worded as one.
	test("and a lookup nothing resolves is not an asset yet", () => {
		const resolved = resolveAsset("instance.PRINCIPAL", "output out", context);

		expect(resolved.ok).toBe(false);
		expect(resolved.ok ? "" : resolved.reason).toContain("could not establish");
		expect(resolved.ok ? "" : resolved.reason).toContain("instance.PRINCIPAL");
	});

	test("a lookup resolving to something that is not an id is refused too", () => {
		const resolved = resolveAsset("instance.PRINCIPAL", "output out", {
			policyAsset: POLICY_ASSET,
			scope: { instance: { PRINCIPAL: 7 }, params: {} },
		});

		expect(resolved.ok ? "" : resolved.reason).toContain("not an asset id");
	});
});

/**
 * A deployment of the published lending protocol with every asset a different asset.
 *
 * Distinct ids on purpose: an instance that reused one id would make a ledger that never
 * separated them look exactly like one that did.
 */
const LENDING = {
	BORROWER_NFT_ASSET_ID: "b0".repeat(32),
	COLLATERAL_AMOUNT: "500000",
	COLLATERAL_ASSET_ID: "c0".repeat(32),
	CURRENT_DEBT: "110000",
	FACTORY_ASSET_ID: "fa".repeat(32),
	LENDER_NFT_ASSET_ID: "1e".repeat(32),
	LENDING_PROGRAM_ID: "a9b4ade7",
	LOAN_EXPIRATION_TIME: "900000",
	PRINCIPAL_AMOUNT: "100000",
	PRINCIPAL_ASSET_ID: "d0".repeat(32),
	PRINCIPAL_INTEREST_RATE: "1000",
	PROTOCOL_FEE_KEEPER_ASSET_ID: "fe".repeat(32),
};

const DEX = {
	AMOUNT_B: "250000",
	ASSET_B: "bb".repeat(32),
	OFFER_AMOUNT: "500000",
	OFFER_ASSET_ID: "aa".repeat(32),
};

/** What each asset still needs from the wallet, which is the whole question funding asks. */
function outstanding(
	manifest: Record<string, unknown>,
	name: string,
	scope: ReferenceScope,
	held: HeldValue[],
): Record<string, string> {
	const action = findAction(normaliseManifest(manifest).manifest, name);

	if (!action) {
		throw new Error(`this document declares no ${name}`);
	}

	const plan = planAction(action, scope);

	if (!plan.ok) {
		throw new Error(plan.reason);
	}

	const ledger = assetLedger(action, plan.plan.outputs, {
		held,
		policyAsset: POLICY_ASSET,
		scope,
	});

	if (!ledger.ok) {
		throw new Error(ledger.reason);
	}

	return Object.fromEntries(
		ledger.ledger.entries.map((entry) => [entry.asset, (entry.needed - entry.held).toString()]),
	);
}

// Every one of these is the document as its authors published it, read with a deployment
// filled in. The claim is not that the wallet can build them — three of them state a position
// it cannot put a funded input at — but that what each asset costs is now a separate figure,
// and that the figure is right.
describe("what the published corpus actually asks a wallet to fund", () => {
	const lendingScope = (extra: Record<string, unknown> = {}): ReferenceScope => ({
		fee: 0n,
		instance: LENDING,
		params: { LENDER_VAULT_AMOUNT: "105000", TOTAL_PROTOCOL_FEE: "5000", ...extra },
	});

	// A swap: the taker finds the asset being paid and the fee, and nothing else. The offered
	// asset comes out of the covenant and goes straight back out, so it nets to nothing.
	test("a two-asset swap is funded in the asset it pays and in the fee, and in nothing else", () => {
		expect(
			outstanding(
				dexManifest as unknown as Record<string, unknown>,
				"Settle",
				{
					fee: 0n,
					inputs: { offer_in: { amount_sat: 500_000n } },
					instance: DEX,
					params: {},
				},
				[{ asset: DEX.OFFER_ASSET_ID, id: "offer_in", sats: 500_000n }],
			),
		).toEqual({
			[DEX.ASSET_B]: "250000",
			[DEX.OFFER_ASSET_ID]: "0",
			[POLICY_ASSET]: "0",
		});
	});

	// Accepting an offer: the lender finds the principal. The collateral is the covenant's and
	// stays in it, the NFT it takes is the covenant's too, and the fee is the wallet's.
	test("accepting an offer needs the principal and nothing else", () => {
		expect(
			outstanding(
				lendingManifest as unknown as Record<string, unknown>,
				"AcceptOffer",
				lendingScope(),
				[
					{ asset: LENDING.COLLATERAL_ASSET_ID, id: "pending_offer_in", sats: 500_000n },
					{ asset: LENDING.LENDER_NFT_ASSET_ID, id: "lender_nft_in", sats: 1n },
				],
			),
		).toEqual({
			[LENDING.COLLATERAL_ASSET_ID]: "0",
			[LENDING.LENDER_NFT_ASSET_ID]: "0",
			[LENDING.PRINCIPAL_ASSET_ID]: "100000",
			[POLICY_ASSET]: "0",
		});
	});

	// Claiming the principal needs nothing beyond the fee: the principal is in the covenant
	// being spent, and the NFT that authorises the claim comes back out again.
	test("claiming the principal needs nothing but the fee, and the borrower's own token", () => {
		expect(
			outstanding(
				lendingManifest as unknown as Record<string, unknown>,
				"ClaimPrincipal",
				lendingScope(),
				[{ asset: LENDING.PRINCIPAL_ASSET_ID, id: "principal_asset_auth_in", sats: 100_000n }],
			),
		).toEqual({
			[LENDING.BORROWER_NFT_ASSET_ID]: "1",
			[LENDING.PRINCIPAL_ASSET_ID]: "0",
			[POLICY_ASSET]: "0",
		});
	});

	// Cancelling burns two tokens by paying them to an unspendable output. A runtime reading an
	// OP_RETURN as paying nothing would have funded neither, and the token the wallet holds
	// would never have been added as an input at all.
	test("cancelling an offer funds the token it burns", () => {
		expect(
			outstanding(
				lendingManifest as unknown as Record<string, unknown>,
				"CancelOffer",
				lendingScope(),
				[
					{ asset: LENDING.COLLATERAL_ASSET_ID, id: "pending_offer_in", sats: 500_000n },
					{ asset: LENDING.LENDER_NFT_ASSET_ID, id: "lender_nft_in", sats: 1n },
				],
			),
		).toEqual({
			[LENDING.BORROWER_NFT_ASSET_ID]: "1",
			[LENDING.COLLATERAL_ASSET_ID]: "0",
			[LENDING.LENDER_NFT_ASSET_ID]: "0",
			[POLICY_ASSET]: "0",
		});
	});

	// Repaying: the debt is the borrower's to find, in the principal asset, and the collateral
	// comes back out of the covenant it was locked in.
	test("repaying a loan needs the debt in the principal asset", () => {
		expect(
			outstanding(
				lendingManifest as unknown as Record<string, unknown>,
				"RepayLoan",
				lendingScope(),
				[{ asset: LENDING.COLLATERAL_ASSET_ID, id: "active_offer_in", sats: 500_000n }],
			),
		).toEqual({
			[LENDING.BORROWER_NFT_ASSET_ID]: "1",
			[LENDING.COLLATERAL_ASSET_ID]: "0",
			[LENDING.PRINCIPAL_ASSET_ID]: "110000",
			[POLICY_ASSET]: "0",
		});
	});

	// This action used to be the one here that could not be read at all, and not for anything to
	// do with its assets: the record it publishes declares three part types the object-form
	// vocabulary had no word for. It was asserted as a refusal rather than skipped, so that
	// whoever added them would find this case waiting to be turned on. It is on.
	//
	// Creating an offer: the wallet brings the collateral and the factory's auth token, and mints
	// the two tokens the offer's two sides are held by. The factory reappears at both ends, which
	// is why one unit of it is still outstanding after the one the wallet holds.
	test("creating an offer needs the collateral, the factory, and the tokens it mints", () => {
		expect(
			outstanding(
				lendingManifest as unknown as Record<string, unknown>,
				"CreateOffer",
				lendingScope(),
				[
					{ asset: LENDING.COLLATERAL_ASSET_ID, id: "collateral_in", sats: 500_000n },
					{ asset: LENDING.FACTORY_ASSET_ID, id: "factory_auth_in", sats: 1n },
				],
			),
		).toEqual({
			[LENDING.BORROWER_NFT_ASSET_ID]: "1",
			[LENDING.COLLATERAL_ASSET_ID]: "0",
			[LENDING.FACTORY_ASSET_ID]: "1",
			[LENDING.LENDER_NFT_ASSET_ID]: "1",
			[POLICY_ASSET]: "0",
		});
	});

	// And where each asset's surplus goes back to, which is what makes the change for one of
	// them separate from the change for another.
	test("and each asset that declares a change output keeps its own", () => {
		const action = findAction(
			normaliseManifest(lendingManifest as unknown as Record<string, unknown>).manifest,
			"AcceptOffer",
		);
		const scope = lendingScope();
		const plan = action && planAction(action, scope);

		if (!action || !plan?.ok) {
			throw new Error("the published AcceptOffer could not be planned");
		}

		const ledger = assetLedger(action, plan.plan.outputs, {
			held: [],
			policyAsset: POLICY_ASSET,
			scope,
		});

		if (!ledger.ok) {
			throw new Error(ledger.reason);
		}

		expect(
			Object.fromEntries(
				ledger.ledger.entries
					.filter((entry) => entry.change)
					.map((entry) => [entry.asset, entry.change?.id]),
			),
		).toEqual({
			[LENDING.PRINCIPAL_ASSET_ID]: "principal_change",
			[POLICY_ASSET]: "fee_change",
		});
	});
});
