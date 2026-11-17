import { describe, expect, test } from "bun:test";

import { computed, fromDapp, type ShownConfirmation, verified } from "@humid/tx-manifest";
import { renderToStaticMarkup } from "react-dom/server";

import {
	isProcessCtConfirmationData,
	PROCESS_CT_CONFIRMATION_KIND,
	processCtConfirmationRenderer,
	readable,
} from "./ProcessCtConfirmation";
import { LENDING_OFFER } from "./processCtFixtures";

const MODEL = LENDING_OFFER.shown;
const TOKEN = "aa".repeat(32);

const payload = (shown: unknown = MODEL, extra: Record<string, unknown> = {}) => ({
	...LENDING_OFFER,
	shown,
	...extra,
});

const spoiled = (field: keyof ShownConfirmation, value: unknown) => ({ ...MODEL, [field]: value });

describe("the payload this surface accepts", () => {
	test("recognises the one the method builds", () => {
		expect(isProcessCtConfirmationData(payload())).toBe(true);
	});

	test("accepts a model carrying no summary, which is a protocol that wrote none", () => {
		const { summary: _summary, ...withoutSummary } = MODEL;

		expect(isProcessCtConfirmationData(payload(withoutSummary))).toBe(true);
	});

	test("refuses a payload of another kind, or of no shape at all", () => {
		expect(isProcessCtConfirmationData({ kind: "liquid.signPset" })).toBe(false);
		expect(isProcessCtConfirmationData(null)).toBe(false);
		expect(isProcessCtConfirmationData(undefined)).toBe(false);
		expect(isProcessCtConfirmationData("a string")).toBe(false);
	});

	test("refuses its own kind backed by nothing, or by something that is not a model", () => {
		expect(isProcessCtConfirmationData({ kind: PROCESS_CT_CONFIRMATION_KIND })).toBe(false);
		expect(isProcessCtConfirmationData(payload(null))).toBe(false);
		expect(isProcessCtConfirmationData(payload("not a model"))).toBe(false);
		expect(isProcessCtConfirmationData(payload({}))).toBe(false);
	});

	test("refuses a payload without the network or the assets it names", () => {
		expect(isProcessCtConfirmationData(payload(MODEL, { network: undefined }))).toBe(false);
		expect(isProcessCtConfirmationData(payload(MODEL, { assets: undefined }))).toBe(false);
		expect(
			isProcessCtConfirmationData(payload(MODEL, { assets: { [TOKEN]: { ticker: "T" } } })),
		).toBe(false);
	});

	test("refuses a value that lost its origin on the way here", () => {
		expect(isProcessCtConfirmationData(payload(spoiled("account", "Account 0")))).toBe(false);
		expect(isProcessCtConfirmationData(payload(spoiled("protocol", { value: "lending" })))).toBe(
			false,
		);
	});

	test("refuses an origin this wallet has no word for", () => {
		expect(
			isProcessCtConfirmationData(payload(spoiled("action", { origin: "trusted", value: "Pay" }))),
		).toBe(false);
	});

	test("refuses an amount that is not a whole number of base units", () => {
		expect(isProcessCtConfirmationData(payload(spoiled("feeSats", computed("0.5"))))).toBe(false);
		expect(isProcessCtConfirmationData(payload(spoiled("feeSats", computed(""))))).toBe(false);
		expect(isProcessCtConfirmationData(payload(spoiled("feeSats", computed(344))))).toBe(false);
	});

	test("refuses a fee with a sign on it, and keeps the sign on a balance change", () => {
		expect(isProcessCtConfirmationData(payload(spoiled("feeSats", computed("-344"))))).toBe(false);
		expect(
			isProcessCtConfirmationData(
				payload(spoiled("netEffect", [{ asset: computed(TOKEN), sats: computed("-50500") }])),
			),
		).toBe(true);
	});

	test("refuses a list that is not one, or a row missing half of itself", () => {
		expect(isProcessCtConfirmationData(payload(spoiled("netEffect", {})))).toBe(false);
		expect(
			isProcessCtConfirmationData(payload(spoiled("netEffect", [{ asset: computed(TOKEN) }]))),
		).toBe(false);
		expect(
			isProcessCtConfirmationData(payload(spoiled("blindedAmounts", [{ id: fromDapp("out") }]))),
		).toBe(false);
	});

	test("refuses an input or output of a kind it has no word for, or with a signed amount", () => {
		const row = { asset: computed(TOKEN), kind: "wallet", sats: computed("1") };

		expect(isProcessCtConfirmationData(payload(spoiled("inputs", [row])))).toBe(true);
		expect(isProcessCtConfirmationData(payload(spoiled("inputs", [{ ...row, kind: "fee" }])))).toBe(
			false,
		);
		expect(
			isProcessCtConfirmationData(payload(spoiled("outputs", [{ ...row, sats: computed("-1") }]))),
		).toBe(false);
		expect(
			isProcessCtConfirmationData(payload(spoiled("outputs", [{ ...row, name: "unattributed" }]))),
		).toBe(false);
	});

	test("refuses a program row that does not carry its type or its verdict", () => {
		expect(
			isProcessCtConfirmationData(
				payload(spoiled("programs", [{ address: verified("tex1p"), verified: computed(true) }])),
			),
		).toBe(false);
		expect(
			isProcessCtConfirmationData(
				payload(
					spoiled("programs", [
						{ address: verified("tex1p"), utxoType: fromDapp("p2pk"), verified: computed("yes") },
					]),
				),
			),
		).toBe(false);
	});

	test("refuses a summary that is present and unattributed", () => {
		expect(isProcessCtConfirmationData(payload(spoiled("summary", "the dapp says so")))).toBe(
			false,
		);
	});
});

describe("which body the host is given", () => {
	const rendered = (data: unknown, onConfirm: () => void = () => {}) =>
		processCtConfirmationRenderer.render({
			onConfirm,
			onDecline: () => {},
			request: { data } as never,
		});

	test("is registered under the kind the method puts on the payload", () => {
		expect(processCtConfirmationRenderer.kind).toBe(PROCESS_CT_CONFIRMATION_KIND);
	});

	test("nothing at all for a payload that is not its own", () => {
		expect(rendered({ kind: "something.else" })).toBeNull();
	});

	test("the confirmation for one it can read", () => {
		expect(renderToStaticMarkup(rendered(payload()) as never)).toContain("Sign and send");
	});

	test("and a refusal with only a way out for one of its own kind it cannot read", () => {
		let confirmed = 0;
		const html = renderToStaticMarkup(rendered(payload({}), () => (confirmed += 1)) as never);

		expect(html).toContain("This request can&#x27;t be shown");
		expect(html).toContain("nothing was signed or sent");
		expect(html).toContain(">Close<");
		expect(html).not.toContain(">Sign");
		expect(confirmed).toBe(0);
	});
});

describe("how a name the protocol wrote reads", () => {
	test("in words, whichever way the protocol joined them", () => {
		expect(readable("lending_contract")).toBe("Lending contract");
		expect(readable("CreateOffer")).toBe("Create offer");
		expect(readable("issuance-factory")).toBe("Issuance factory");
	});
});
