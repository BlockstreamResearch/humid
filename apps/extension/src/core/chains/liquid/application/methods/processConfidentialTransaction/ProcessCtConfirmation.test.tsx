import { describe, expect, test } from "bun:test";

import { computed, fromSite, type ShownConfirmation, verified } from "@humid/tx-manifest";
import { renderToStaticMarkup } from "react-dom/server";

import {
	feeLine,
	isProcessCtConfirmationData,
	netEffectLine,
	PROCESS_CT_CONFIRMATION_KIND,
	ProcessCtConfirmation,
	processCtConfirmationRenderer,
} from "./ProcessCtConfirmation";

// What this surface is handed, what it will accept, and what a person actually reads on it.
// The property that cannot be tested here is enforced by the type: every value it displays is
// provenanced, so an unattributed one cannot reach it at all — that is asserted in the
// package, where the brand lives.

const FEE_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const TOKEN = "aa".repeat(32);

const MODEL: ShownConfirmation = {
	account: computed("liquid:testnet account 0"),
	action: fromSite("Receive"),
	covenants: [
		{
			address: verified("tex1p_derived"),
			utxoType: fromSite("p2pk_output"),
			verified: computed(true),
		},
	],
	feeAsset: computed(FEE_ASSET),
	feeSats: computed("344"),
	hiddenAmounts: [
		{
			decidedBy: computed("this protocol asks for it to be hidden"),
			id: fromSite("received_out"),
		},
	],
	netEffect: [{ asset: computed(FEE_ASSET), sats: computed("-50500") }],
	protocol: fromSite("p2pk-simplicity"),
	publishedAmounts: [
		{
			id: computed("change"),
			reason: computed(
				"nothing says otherwise and this network hides an output by default, and this " +
					"wallet publishes it anyway so your next action can spend it",
			),
		},
	],
	summary: fromSite("Spend a p2pk output back into your wallet."),
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

/** The same model with one field replaced by something that came off a wire. */
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

	// The kind alone is what the host selects on, so everything below says the right kind and
	// is still not something this surface can render. Each of them reached the markup before
	// the model was checked all the way down, and each of them threw inside it.
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

	// An origin outside the published vocabulary never came from this package, and a screen
	// that rendered one would have no sentence to put under the value.
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

	// A fee is what this costs. A negative one is not a figure the wallet produces, and it
	// would print as a gain under a heading that says otherwise.
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
			isProcessCtConfirmationData(payload(spoiled("hiddenAmounts", [{ id: fromSite("out") }]))),
		).toBe(false);
		expect(
			isProcessCtConfirmationData(
				payload(spoiled("publishedAmounts", [{ id: computed("change") }])),
			),
		).toBe(false);
	});

	// The covenant row carries three facts and the screen shows all three, so a row short of
	// one of them is a row this surface cannot write.
	test("refuses a covenant row that does not carry its type or its verdict", () => {
		expect(
			isProcessCtConfirmationData(
				payload(spoiled("covenants", [{ address: verified("tex1p"), verified: computed(true) }])),
			),
		).toBe(false);
		expect(
			isProcessCtConfirmationData(
				payload(spoiled("covenants", [{ address: verified("tex1p"), utxoType: fromSite("p2pk") }])),
			),
		).toBe(false);
		expect(
			isProcessCtConfirmationData(
				payload(
					spoiled("covenants", [
						{ address: verified("tex1p"), utxoType: fromSite("p2pk"), verified: computed("yes") },
					]),
				),
			),
		).toBe(false);
	});

	test("refuses a summary that is present and unattributed", () => {
		expect(isProcessCtConfirmationData(payload(spoiled("summary", "the site says so")))).toBe(
			false,
		);
	});
});

describe("which body the host is given", () => {
	test("is registered under the kind the method puts on the payload", () => {
		expect(processCtConfirmationRenderer.kind).toBe(PROCESS_CT_CONFIRMATION_KIND);
	});

	// Nothing, so the host keeps looking. This is the only case where nothing is the right
	// answer: the payload is somebody else's.
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

	/** The rendered body for a payload of this kind, whatever is behind it. */
	const rendered = (shown: unknown, onConfirm: () => void = () => {}) =>
		renderToStaticMarkup(
			processCtConfirmationRenderer.render({
				onConfirm,
				onDecline: () => {},
				request: { data: payload(shown) } as never,
			}) as never,
		);

	// The host picks a body by kind and shows what it picked. There is nothing behind this
	// one, so returning nothing here would leave a person facing an empty screen with no way
	// to decline — which is worse than the payload that caused it.
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

	// The point of the refusal body: there is no path from an unreadable payload to an
	// approval, and no button that could be pressed into becoming one.
	test("and cannot approve anything, because it holds nothing that would", () => {
		let confirmed = 0;

		expect(rendered(null, () => (confirmed += 1))).toContain("This cannot be shown to you");
		expect(confirmed).toBe(0);
	});
});

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

// One balance change per asset reaches this surface, and only one of them is in an asset this
// wallet knows how to name and how to divide.
describe("a balance change in each asset the action moves", () => {
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

// What a person actually reads. Every value on this screen is accompanied by where it came
// from, and the sentence for the site's word is the one that has to be unmistakable.
describe("what the screen says", () => {
	test("shows the balance change, the fee and the acting account", () => {
		const html = markup();

		expect(html).toContain("−0.000505 L-BTC");
		expect(html).toContain("0.00000344 L-BTC");
		expect(html).toContain("liquid:testnet account 0");
	});

	test("attributes the site's own words to the site, in words", () => {
		const html = markup();

		expect(html).toContain("p2pk-simplicity");
		expect(html).toContain("Spend a p2pk output back into your wallet.");
		expect(html).toContain("claimed by the site");
	});

	test("and says which of the wallet's findings it checked against the network", () => {
		const html = markup();

		expect(html).toContain("Contract, checked");
		expect(html).toContain("tex1p_derived");
		expect(html).toContain("checked by this wallet against the network");
	});

	test("says a covenant it could not compare is not on chain yet", () => {
		const html = markup({
			...MODEL,
			covenants: [
				{
					address: computed("tex1p_derived"),
					utxoType: fromSite("p2pk_output"),
					verified: computed(false),
				},
			],
		});

		expect(html).toContain("Contract, not yet on chain");
		expect(html).toContain("worked out by this wallet");
	});

	// What the protocol calls a covenant is on the screen beside the address the wallet
	// derived, and is labelled as the protocol's word. A person reading a name next to a
	// checked address should be able to tell which half of that line the wallet vouches for.
	test("names what the protocol calls each covenant, as the site's word", () => {
		const html = markup();
		const utxoType = html.indexOf("p2pk_output");

		expect(utxoType).toBeGreaterThan(-1);

		// The attribution follows the name rather than sitting somewhere else on the screen.
		// Found first, then placed: an absent one indexes as -1, which is less than any
		// distance and would otherwise pass this as though it were right beside the name.
		const attribution = html.indexOf("claimed by the site", utxoType);

		expect(attribution).toBeGreaterThan(utxoType);
		expect(attribution - utxoType).toBeLessThan(200);
	});

	// Two values on one row, and two attributions. The name is the protocol's word for the
	// output and the sentence under it is this wallet's reading of the document; one label
	// under the pair would leave a person unable to tell which of them the wallet stands
	// behind, which is the only question this screen exists to answer.
	test("attributes a hidden amount's name separately from the word that hid it", () => {
		const html = markup();
		const name = html.indexOf("received_out");
		const decision = html.indexOf("this protocol asks for it to be hidden");
		const between = html.slice(name, decision);

		expect(name).toBeGreaterThan(-1);
		expect(decision).toBeGreaterThan(name);
		// The name is the site's and says so before the sentence beneath it begins.
		expect(between).toContain("claimed by the site");
		expect(html.slice(decision)).toContain("worked out by this wallet");
	});

	// The published row's name is usually the wallet's own word for its change rather than
	// anything the document wrote, so its attribution is not the one under the sentence.
	test("and a published amount's name separately from the reason it was published", () => {
		const html = markup();
		const name = html.indexOf(">change<");
		const reason = html.indexOf("so your next action can spend it");

		expect(name).toBeGreaterThan(-1);
		expect(reason).toBeGreaterThan(name);
		expect(html.slice(name, reason)).toContain("worked out by this wallet");
	});

	// The same row when the document did name the output: then the name is the site's word
	// and the sentence beside it is still the wallet's, and the screen says both.
	test("marking that name as the site's where the document wrote one", () => {
		const html = markup({
			...MODEL,
			publishedAmounts: [
				{
					id: fromSite("token_change"),
					reason: computed("this protocol asks for it to be hidden"),
				},
			],
		});
		const name = html.indexOf("token_change");

		expect(name).toBeGreaterThan(-1);
		expect(
			html.slice(name, html.indexOf("this protocol asks for it to be hidden", name)),
		).toContain("claimed by the site");
	});

	test("names every amount it hides and whose word decided that", () => {
		const html = markup();

		expect(html).toContain("Amount hidden on chain");
		expect(html).toContain("received_out");
		expect(html).toContain("this protocol asks for it to be hidden");
	});

	test("and every amount it publishes over the format, with the word it set aside", () => {
		const html = markup();

		expect(html).toContain("Amount published on chain");
		expect(html).toContain("so your next action can spend it");
	});

	// A token this wallet was never told how to divide is shown in base units beside its id,
	// and never under the network asset's name.
	test("shows a protocol's own token in base units, never as L-BTC", () => {
		const html = markup({
			...MODEL,
			netEffect: [{ asset: computed(TOKEN), sats: computed("-1") }],
		});

		expect(html).toContain("−1");
		expect(html).toContain(TOKEN);
		expect(html).not.toContain("−1 L-BTC");
	});

	// What this screen asks for is authorisation and nothing beyond it. Whether the signed
	// transaction is handed back or sent is decided where it is sent, and a button here saying
	// so would describe something this surface does not do.
	test("offers to sign, and says nothing about sending", () => {
		const html = markup();

		expect(html).toContain(">Sign<");
		expect(html).toContain(">Decline<");
		expect(html).not.toContain("Sign and send");
		expect(html.toLowerCase()).not.toContain("broadcast");
	});

	test("omits the summary a protocol did not write", () => {
		const { summary: _summary, ...withoutSummary } = MODEL;

		expect(markup(withoutSummary)).not.toContain("What the site says this does");
	});
});

/**
 * Which of the two authorisations this screen is asking for.
 *
 * A signature handed back to the site and a signature broadcast are different things to agree
 * to, and the request says which. A screen that showed one word for both would be asking a
 * person to approve something the wallet knew and did not tell them.
 */
describe("what the button says it will do", () => {
	test("offers to sign, for a request that will not send", () => {
		const rendered = markup(MODEL, false);

		expect(rendered).toContain(">Sign<");
		expect(rendered).not.toContain("Sign and send");
		expect(rendered).toContain("handed back to the site rather than sent");
	});

	test("offers to sign and send, for a request that will", () => {
		const rendered = markup(MODEL, true);

		expect(rendered).toContain("Sign and send");
		expect(rendered).toContain("signed and sent");
	});

	// Not defaulted. A payload that omits it cannot say which of the two questions is being
	// asked, and reading the absence as the quieter answer would put "Sign" on a screen that is
	// about to broadcast.
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
