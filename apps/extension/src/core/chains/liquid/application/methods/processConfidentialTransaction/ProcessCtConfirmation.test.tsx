import { describe, expect, test } from "bun:test";

import { computed, fromSite, verified } from "../../../domain/manifest/provenance";
import {
	isProcessCtConfirmationData,
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
	feeSats: computed(500n),
	netEffect: [{ asset: computed("lbtc"), sats: computed(-50_500n) }],
	protocol: fromSite("p2pk-simplicity"),
	summary: fromSite("Spend a p2pk output back into your wallet."),
};

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
