import { describe, expect, test } from "bun:test";

import { computed, fromDapp, type ShownConfirmation, verified } from "@humid/tx-manifest";
import { renderToStaticMarkup } from "react-dom/server";

import {
	feeLine,
	isProcessCtConfirmationData,
	netEffectLine,
	PROCESS_CT_CONFIRMATION_KIND,
	ProcessCtConfirmation,
	processCtConfirmationRenderer,
} from "./ProcessCtConfirmation";

const FEE_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const TOKEN = "aa".repeat(32);

const MODEL: ShownConfirmation = {
	account: computed("liquid:testnet account 0"),
	action: fromDapp("Receive"),
	covenants: [
		{
			address: verified("tex1p_derived"),
			cmr: computed("cc".repeat(32)),
			tapleafHash: computed("1e".repeat(32)),
			utxoType: fromDapp("p2pk_output"),
			verified: computed(true),
		},
	],
	feeAsset: computed(FEE_ASSET),
	feeSats: computed("344"),
	hiddenAmounts: [
		{
			decidedBy: computed("this protocol asks for it to be hidden"),
			id: fromDapp("received_out"),
		},
	],
	netEffect: [{ asset: computed(FEE_ASSET), sats: computed("-50500") }],
	protocol: fromDapp("p2pk-simplicity"),
	publishedAmounts: [
		{
			id: computed("change"),
			reason: computed(
				"nothing says otherwise and this network hides an output by default, and this " +
					"wallet publishes it anyway so your next action can spend it",
			),
		},
	],
	summary: fromDapp("Spend a p2pk output back into your wallet."),
};

const payload = (shown: unknown = MODEL, broadcast = false) => ({
	broadcast,
	kind: PROCESS_CT_CONFIRMATION_KIND,
	shown,
});

const markup = (shown: ShownConfirmation = MODEL, broadcast = false) =>
	renderToStaticMarkup(
		<ProcessCtConfirmation
			data={{ broadcast, kind: PROCESS_CT_CONFIRMATION_KIND, shown }}
			onConfirm={() => {}}
			onDecline={() => {}}
		/>,
	);

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

	test("refuses its own kind with nothing, or something that is not a model, behind it", () => {
		expect(isProcessCtConfirmationData({ kind: PROCESS_CT_CONFIRMATION_KIND })).toBe(false);
		expect(isProcessCtConfirmationData(payload(null))).toBe(false);
		expect(isProcessCtConfirmationData(payload("not a model"))).toBe(false);
		expect(isProcessCtConfirmationData(payload({}))).toBe(false);
	});

	test("refuses a value that lost its origin on the way here", () => {
		expect(isProcessCtConfirmationData(payload(spoiled("account", "liquid:testnet")))).toBe(false);
		expect(
			isProcessCtConfirmationData(payload(spoiled("protocol", { value: "p2pk-simplicity" }))),
		).toBe(false);
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
				payload(spoiled("netEffect", [{ asset: computed(FEE_ASSET), sats: computed("-50500") }])),
			),
		).toBe(true);
	});

	test("refuses a list that is not one, or a row missing half of itself", () => {
		expect(isProcessCtConfirmationData(payload(spoiled("netEffect", {})))).toBe(false);
		expect(
			isProcessCtConfirmationData(payload(spoiled("netEffect", [{ asset: computed(TOKEN) }]))),
		).toBe(false);
		expect(
			isProcessCtConfirmationData(payload(spoiled("hiddenAmounts", [{ id: fromDapp("out") }]))),
		).toBe(false);
		expect(
			isProcessCtConfirmationData(
				payload(spoiled("publishedAmounts", [{ id: computed("change") }])),
			),
		).toBe(false);
	});

	test("refuses a covenant row that does not carry its type or its verdict", () => {
		expect(
			isProcessCtConfirmationData(
				payload(spoiled("covenants", [{ address: verified("tex1p"), verified: computed(true) }])),
			),
		).toBe(false);
		expect(
			isProcessCtConfirmationData(
				payload(spoiled("covenants", [{ address: verified("tex1p"), utxoType: fromDapp("p2pk") }])),
			),
		).toBe(false);
		expect(
			isProcessCtConfirmationData(
				payload(
					spoiled("covenants", [
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
	test("is registered under the kind the method puts on the payload", () => {
		expect(processCtConfirmationRenderer.kind).toBe(PROCESS_CT_CONFIRMATION_KIND);
	});

	test("nothing at all for a payload that is not its own", () => {
		expect(
			processCtConfirmationRenderer.render({
				onConfirm: () => {},
				onDecline: () => {},
				request: { data: { kind: "something.else" } } as never,
			}),
		).toBeNull();
	});

	test("the confirmation for one it can read", () => {
		expect(
			processCtConfirmationRenderer.render({
				onConfirm: () => {},
				onDecline: () => {},
				request: { data: payload() } as never,
			}),
		).not.toBeNull();
	});

	const rendered = (shown: unknown, onConfirm: () => void = () => {}) =>
		renderToStaticMarkup(
			processCtConfirmationRenderer.render({
				onConfirm,
				onDecline: () => {},
				request: { data: payload(shown) } as never,
			}) as never,
		);

	test("and a refusal, not nothing, for one of its own kind it cannot read", () => {
		const html = rendered({});

		expect(html).toContain("This cannot be shown to you");
		expect(html).toContain("Nothing has been signed and nothing has been sent.");
	});

	test("which offers only a way out, and no way to approve", () => {
		const html = rendered({ ...MODEL, feeSats: "344" });

		expect(html).toContain(">Close<");
		expect(html).not.toContain(">Sign<");
		expect(html).not.toContain("Decline");
	});

	test("and cannot approve anything, because it holds nothing that would", () => {
		let confirmed = 0;

		expect(rendered(null, () => (confirmed += 1))).toContain("This cannot be shown to you");
		expect(confirmed).toBe(0);
	});
});

describe("the fee, which is a price rather than a balance change", () => {
	test("is written without a sign", () => {
		expect(feeLine("108")).toBe("0.00000108 L-BTC");
	});

	test("still names the asset the network charges in", () => {
		expect(feeLine("0")).toBe("0 L-BTC");
	});
});

describe("a balance change in each asset the action moves", () => {
	test("the network's own asset is shown by name, divided the way it divides", () => {
		expect(netEffectLine({ asset: FEE_ASSET, sats: "-50500" }, FEE_ASSET)).toEqual({
			shown: "−0.000505 L-BTC",
		});
	});

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

describe("what the screen says", () => {
	test("shows the balance change, the fee and the acting account", () => {
		const html = markup();

		expect(html).toContain("−0.000505 L-BTC");
		expect(html).toContain("0.00000344 L-BTC");
		expect(html).toContain("liquid:testnet account 0");
	});

	test("attributes the dapp's own words to the dapp, in words", () => {
		const html = markup();

		expect(html).toContain("p2pk-simplicity");
		expect(html).toContain("Spend a p2pk output back into your wallet.");
		expect(html).toContain("claimed by the dapp");
	});

	test("and says which of the wallet's findings it checked against the network", () => {
		const html = markup();

		expect(html).toContain("Contract, checked");
		expect(html).toContain("tex1p_derived");
		expect(html).toContain("checked by this wallet against the network");
	});

	test("says a covenant it could not compare is not onchain yet", () => {
		const html = markup({
			...MODEL,
			covenants: [
				{
					address: computed("tex1p_derived"),
					cmr: computed("cc".repeat(32)),
					tapleafHash: computed("1e".repeat(32)),
					utxoType: fromDapp("p2pk_output"),
					verified: computed(false),
				},
			],
		});

		expect(html).toContain("Contract, not yet onchain");
		expect(html).toContain("worked out by this wallet");
	});

	test("names what the protocol calls each covenant, as the dapp's word", () => {
		const html = markup();
		const utxoType = html.indexOf("p2pk_output");

		expect(utxoType).toBeGreaterThan(-1);

		const attribution = html.indexOf("claimed by the dapp", utxoType);

		expect(attribution).toBeGreaterThan(utxoType);
		expect(attribution - utxoType).toBeLessThan(200);
	});

	test("attributes a hidden amount's name separately from the word that hid it", () => {
		const html = markup();
		const name = html.indexOf("received_out");
		const decision = html.indexOf("this protocol asks for it to be hidden");
		const between = html.slice(name, decision);

		expect(name).toBeGreaterThan(-1);
		expect(decision).toBeGreaterThan(name);
		expect(between).toContain("claimed by the dapp");
		expect(html.slice(decision)).toContain("worked out by this wallet");
	});

	test("and a published amount's name separately from the reason it was published", () => {
		const html = markup();
		const name = html.indexOf(">change<");
		const reason = html.indexOf("so your next action can spend it");

		expect(name).toBeGreaterThan(-1);
		expect(reason).toBeGreaterThan(name);
		expect(html.slice(name, reason)).toContain("worked out by this wallet");
	});

	test("marking that name as the dapp's where the document wrote one", () => {
		const html = markup({
			...MODEL,
			publishedAmounts: [
				{
					id: fromDapp("token_change"),
					reason: computed("this protocol asks for it to be hidden"),
				},
			],
		});
		const name = html.indexOf("token_change");

		expect(name).toBeGreaterThan(-1);
		expect(
			html.slice(name, html.indexOf("this protocol asks for it to be hidden", name)),
		).toContain("claimed by the dapp");
	});

	test("names every amount it hides and whose word decided that", () => {
		const html = markup();

		expect(html).toContain("Amount hidden onchain");
		expect(html).toContain("received_out");
		expect(html).toContain("this protocol asks for it to be hidden");
	});

	test("and every amount it publishes over the format, with the word it set aside", () => {
		const html = markup();

		expect(html).toContain("Amount published onchain");
		expect(html).toContain("so your next action can spend it");
	});

	test("shows a protocol's own token in base units, never as L-BTC", () => {
		const html = markup({
			...MODEL,
			netEffect: [{ asset: computed(TOKEN), sats: computed("-1") }],
		});

		expect(html).toContain("−1");
		expect(html).toContain(TOKEN);
		expect(html).not.toContain("−1 L-BTC");
	});

	test("offers to sign, and says nothing about sending", () => {
		const html = markup();

		expect(html).toContain(">Sign<");
		expect(html).toContain(">Decline<");
		expect(html).not.toContain("Sign and send");
		expect(html.toLowerCase()).not.toContain("broadcast");
	});

	test("omits the summary a protocol did not write", () => {
		const { summary: _summary, ...withoutSummary } = MODEL;

		expect(markup(withoutSummary)).not.toContain("What the dapp says this does");
	});
});

describe("what the button says it will do", () => {
	test("offers to sign, for a request that will not send", () => {
		const rendered = markup(MODEL, false);

		expect(rendered).toContain(">Sign<");
		expect(rendered).not.toContain("Sign and send");
		expect(rendered).toContain("handed back to the dapp rather than sent");
	});

	test("offers to sign and send, for a request that will", () => {
		const rendered = markup(MODEL, true);

		expect(rendered).toContain("Sign and send");
		expect(rendered).toContain("signed and sent");
	});

	test("refuses a payload that does not say", () => {
		expect(isProcessCtConfirmationData({ kind: PROCESS_CT_CONFIRMATION_KIND, shown: MODEL })).toBe(
			false,
		);
		expect(
			isProcessCtConfirmationData({
				broadcast: "yes",
				kind: PROCESS_CT_CONFIRMATION_KIND,
				shown: MODEL,
			}),
		).toBe(false);
	});
});
