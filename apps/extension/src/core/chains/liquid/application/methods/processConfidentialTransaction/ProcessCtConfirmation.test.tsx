import { describe, expect, test } from "bun:test";

import { computed, fromSite, verified } from "@humid/tx-manifest";

import {
	feeLine,
	isProcessCtConfirmationData,
	netEffectLine,
	PROCESS_CT_CONFIRMATION_KIND,
	processCtConfirmationRenderer,
} from "./ProcessCtConfirmation";

// AC-06 and AC-07 at the surface. What is checked here is what the surface is handed and
// what it will accept — the rendering itself is JSX with no branching worth asserting, and
// the property that matters is enforced by the type: every value it displays is provenanced,
// so an unattributed one cannot reach it.

const MODEL = {
	account: computed("liquid:testnet account 0"),
	action: fromSite("Receive"),
	covenants: [
		{
			address: verified("tex1p_derived"),
			utxoType: fromSite("p2pk_output"),
			verified: computed(true),
		},
	],
	feeAsset: computed("lbtc"),
	feeSats: computed(500n),
	netEffect: [{ asset: computed("lbtc"), sats: computed(-50_500n) }],
	protocol: fromSite("p2pk-simplicity"),
	summary: fromSite("Spend a p2pk output back into your wallet."),
};

describe("the fee, which is a price rather than a balance change", () => {
	// The balance lines carry a sign because they say which way money moved. The fee is what
	// this transaction costs, and it was rendered by the same function — so a wallet paying a
	// fee printed "+0.00000108 L-BTC" one line under "−0.00000108 L-BTC" for the same amount.
	test("is written without a sign", () => {
		expect(feeLine("108")).toBe("0.00000108 L-BTC");
	});

	test("still names the asset the network charges in", () => {
		expect(feeLine("0")).toBe("0 L-BTC");
	});
});

describe("the contract-action confirmation", () => {
	test("recognises the payload the method builds", () => {
		expect(
			isProcessCtConfirmationData({
				broadcast: false,
				kind: PROCESS_CT_CONFIRMATION_KIND,
				shown: MODEL,
			}),
		).toBe(true);
	});

	test("and refuses anything else, so the host falls back rather than rendering it wrong", () => {
		expect(isProcessCtConfirmationData({ kind: "liquid.signPset" })).toBe(false);
		expect(isProcessCtConfirmationData(null)).toBe(false);
		expect(isProcessCtConfirmationData({ kind: PROCESS_CT_CONFIRMATION_KIND })).toBe(false);
	});

	test("is registered under the kind the method puts on the payload", () => {
		expect(processCtConfirmationRenderer.kind).toBe(PROCESS_CT_CONFIRMATION_KIND);
	});

	test("renders nothing for a payload that is not its own", () => {
		expect(
			processCtConfirmationRenderer.render({
				onConfirm: () => {},
				onDecline: () => {},
				request: { data: { kind: "something.else" } } as never,
			}),
		).toBeNull();
	});
});

// One balance change per asset reaches this surface now, and only one of them is in an asset
// this wallet knows how to name and how to divide.
describe("a balance change in each asset the action moves", () => {
	const FEE_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
	const TOKEN = "aa".repeat(32);

	test("the network's own asset is shown by name, divided the way it divides", () => {
		expect(netEffectLine({ asset: FEE_ASSET, sats: "-50500" }, FEE_ASSET)).toEqual({
			shown: "−0.000505 L-BTC",
		});
	});

	// A protocol's own token divides however that protocol says, which this wallet was never
	// told. Base units and the id are what it can stand behind; "0.00000001 L-BTC" beside a
	// one-of-a-kind token would be two lies in five characters.
	test("and any other asset is shown in base units, beside the id it is", () => {
		expect(netEffectLine({ asset: TOKEN, sats: "-1" }, FEE_ASSET)).toEqual({
			asset: TOKEN,
			shown: "−1",
		});
	});

	test("with the sign kept, because which way it goes is the whole point", () => {
		expect(netEffectLine({ asset: TOKEN, sats: "250000" }, FEE_ASSET).shown).toBe("+250000");
	});
});
