import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import type { TxOutAtOutPoint } from "../chain/chainRead";
import { estimateFeeSats } from "../fee";
import { isRefusal, reviewManifestAction, toShownConfirmation } from "../index";
import type { ParsedLiquidProcessCtParams } from "../request/request";

// What a person is shown, built where what the wallet established is known. Everything here
// goes through the public seam rather than through the model builder: the claim is not that
// the builder agrees with itself, it is that an answer worked out while the document was read
// survives planning and review and reaches the screen with its origin still on it.

const SOURCE_PATH = "./p2pk.simf";
const SOURCE = readFileSync(new URL("../__fixtures__/p2pk.simf", import.meta.url), "utf8");
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const TXID = "b".repeat(64);
const MANIFEST = p2pkManifest as unknown as Record<string, unknown>;

const DERIVED = "tex1p_derived";
const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;
/** A script that is not the covenant's, for the case where the chain has to disagree. */
const ELSEWHERE_SCRIPT = `5120${"22".repeat(32)}`;

const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;
const ACCOUNT = "liquid:testnet account 0";
/** What every covenant in these cases is holding, in the asset the network charges fees in. */
const COVENANT_HOLDS = "50000";

const deps = {
	accountLabel: ACCOUNT,
	compile: () => ({ address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT }),
	fundingUtxos: [
		{ amount: "1000000", spendable: true, txOut: "00", txid: "c".repeat(64), vout: 0 },
	],
	network: "liquid",
	policyAsset: POLICY_ASSET,
	readFeeRate: async () => 1000,
	scriptPubKeyOf: () => DERIVED_SCRIPT,
	walletScriptPubKeyHex: WALLET_SCRIPT,
};

const chainHolding = (scriptPubKeyHex: string) => async (): Promise<TxOutAtOutPoint> => ({
	amountSats: COVENANT_HOLDS,
	rawAssetId: POLICY_ASSET,
	scriptPubKeyHex,
});

const oneCovenantUtxo = { utxos: [{ txid: TXID, utxo_type: "p2pk_output", vout: 0 }] };

/** The Receive action, which spends the covenant the state file locates. */
const spendRequest = (
	manifest: Record<string, unknown> = MANIFEST,
): ParsedLiquidProcessCtParams => ({
	action: "Receive",
	broadcast: false,
	contractSources: { [SOURCE_PATH]: SOURCE },
	manifest,
	params: { pubkey: PUBKEY },
	state: oneCovenantUtxo as unknown as Record<string, unknown>,
});

async function reviewed(
	manifest: Record<string, unknown> = MANIFEST,
	scriptPubKeyHex: string = DERIVED_SCRIPT,
) {
	const result = await reviewManifestAction(spendRequest(manifest), {
		...deps,
		readTxOut: chainHolding(scriptPubKeyHex),
	});

	if (isRefusal(result)) {
		throw new Error(result.reason);
	}

	return result;
}

const shown = async (manifest?: Record<string, unknown>) => (await reviewed(manifest)).confirmation;

describe("what the wallet established for itself", () => {
	test("names which account is acting, because the wallet chose it implicitly", async () => {
		expect((await shown()).account).toMatchObject({ origin: "computed", value: ACCOUNT });
	});

	test("shows what the wallet worked the fee out to be, as its own figure", async () => {
		const model = await shown();

		expect(model.feeSats.value > 0n).toBe(true);
		// Computed rather than read: the network settles a fee this wallet only modelled, and
		// calling the model anything stronger would overstate it.
		expect(model.feeSats.origin).toBe("computed");
	});

	// The estimate is the one the shape of this transaction costs at the rate the chain quoted,
	// rather than a figure the confirmation invented for the screen.
	test("and that figure is what this shape costs at the rate it read", async () => {
		const result = await reviewed();

		expect(result.confirmation.feeSats.value).toBe(result.estimatedFeeSats);
		expect(result.estimatedFeeSats).toBe(
			estimateFeeSats(
				{
					covenantInputs: 1,
					issuingInputs: 0,
					outputs: result.outputs.length,
					walletInputs: result.selected.length,
				},
				result.feeRateSatsPerKvb,
			),
		);
	});

	test("names the asset the network charges its fee in, canonically", async () => {
		expect((await shown()).feeAsset).toMatchObject({ origin: "computed", value: POLICY_ASSET });
	});

	// One line per asset the action moves, never a single figure: a transaction swapping a
	// token for money changes this wallet's balance in two directions at once.
	test("shows the balance change per asset, as the wallet's own finding", async () => {
		const model = await shown();

		expect(model.netEffect).toHaveLength(1);
		expect(model.netEffect[0]?.asset).toMatchObject({ origin: "computed", value: POLICY_ASSET });
		expect(model.netEffect[0]?.sats.origin).toBe("computed");
	});

	// Receive spends a covenant this wallet does not hold and pays it to an output this wallet
	// does, so the person's balance goes up by what was locked and down by what the fee takes.
	// The declared output is counted back deliberately: the ledger counts every declared output
	// as paid out whoever it pays, and one paying this wallet is not money it lost.
	test("and that change is the covenant's holding back, less what the fee takes", async () => {
		const result = await reviewed();

		expect(result.confirmation.netEffect[0]?.sats.value).toBe(
			BigInt(COVENANT_HOLDS) - result.estimatedFeeSats,
		);
	});

	// The other direction, on an action that funds a covenant out of the wallet's own money:
	// what it costs is what it locks up plus the fee.
	test("and reads as an outgoing figure when the action pays a covenant", async () => {
		const result = await reviewManifestAction(
			{
				action: "Pay",
				broadcast: false,
				contractSources: { [SOURCE_PATH]: SOURCE },
				manifest: MANIFEST,
				params: { amount_sat: 1000, pubkey: PUBKEY },
			},
			{ ...deps, readTxOut: chainHolding(ELSEWHERE_SCRIPT) },
		);

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		expect(result.confirmation.netEffect[0]?.sats.value).toBe(-1000n - result.estimatedFeeSats);
	});

	test("marks a covenant it compared against the chain as checked", async () => {
		const [covenant] = (await shown()).covenants;

		expect(covenant?.verified).toMatchObject({ origin: "computed", value: true });
		expect(covenant?.address).toMatchObject({ origin: "verified", value: DERIVED });
	});

	// A covenant this action creates has nothing on chain to compare against, and saying so is
	// a different fact from a check that passed rather than a weaker one.
	test("and says so plainly about one it did not", async () => {
		const result = await reviewManifestAction(
			{
				action: "Pay",
				broadcast: false,
				contractSources: { [SOURCE_PATH]: SOURCE },
				manifest: MANIFEST,
				params: { amount_sat: 1000, pubkey: PUBKEY },
			},
			{ ...deps, readTxOut: chainHolding(ELSEWHERE_SCRIPT) },
		);

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		expect(result.confirmation.covenants[0]?.verified).toMatchObject({
			origin: "computed",
			value: false,
		});
		expect(result.confirmation.covenants[0]?.address.origin).toBe("computed");
	});
});

// The site's own words are on the same screen as the wallet's findings deliberately, and are
// labelled, because the question a person is really answering is how much of what they are
// shown is the site's word.
describe("what the site merely said", () => {
	test("the protocol's name is the site's", async () => {
		expect((await shown()).protocol).toMatchObject({ origin: "site", value: "p2pk-simplicity" });
	});

	test("the action's name is the site's", async () => {
		expect((await shown()).action).toMatchObject({ origin: "site", value: "Receive" });
	});

	test("the protocol's own summary is the site's", async () => {
		expect((await shown()).summary?.origin).toBe("site");
		expect((await shown()).summary?.value).toContain("Spend a p2pk output");
	});

	test("and so is its word for what kind of output a covenant is", async () => {
		expect((await shown()).covenants[0]?.utxoType).toMatchObject({
			origin: "site",
			value: "p2pk_output",
		});
	});
});

/** The same document with one output's own word about hiding changed, or removed. */
function saying(confidential: boolean | undefined): Record<string, unknown> {
	const document = structuredClone(p2pkManifest) as unknown as Record<string, unknown>;
	const output = (
		document as unknown as { actions: { Receive: { outputs: Record<string, unknown>[] } } }
	).actions.Receive.outputs[0]!;

	if (confidential === undefined) {
		delete output.confidential;
	} else {
		output.confidential = confidential;
	}

	return document;
}

/**
 * Whose word hid an amount, followed all the way to the sentence a person reads.
 *
 * The wallet works this out while it reads the document and the builder never needs it: an
 * output is hidden or it is not. So the word behind the decision was computed and dropped, and
 * every hidden amount reached a person — when it reached them at all — with no way to tell
 * "this protocol asked" from "nobody said, and this network's own answer is to hide".
 */
describe("what a person is told about a hidden amount", () => {
	async function hidden(manifest: Record<string, unknown>) {
		return (await shown(manifest)).hiddenAmounts.map((row) => ({
			decidedBy: row.decidedBy.value,
			id: row.id.value,
		}));
	}

	test("when the protocol asked for it outright", async () => {
		expect(await hidden(saying(true))).toContainEqual({
			decidedBy: "this protocol asks for it to be hidden",
			id: "received_out",
		});
	});

	// The step that makes silence a decision, and the one a person is least likely to have
	// expected: this is every hidden output in the published corpus.
	test("when nobody said anything and this network's own answer is to hide", async () => {
		expect(await hidden(saying(undefined))).toContainEqual({
			decidedBy: "nothing says otherwise and this network hides an output by default",
			id: "received_out",
		});
	});

	test("when the document states it for the whole file", async () => {
		expect(await hidden({ ...saying(undefined), confidential_outputs: true })).toContainEqual({
			decidedBy: "this protocol hides its outputs by default",
			id: "received_out",
		});
	});

	// An amount in the open is not on this list at all. The screen says what is hidden, so an
	// output nobody hid has nothing to say there.
	test("and says nothing about an output the protocol leaves in the open", async () => {
		expect((await hidden(saying(false))).map((row) => row.id)).not.toContain("received_out");
	});

	// The word each of these rows carries is the wallet's reading of the document; the name
	// beside it is the protocol's word for the output. That split is the point.
	test("the sentence is the wallet's and the name beside it is the site's", async () => {
		const [row] = (await shown(saying(true))).hiddenAmounts;

		expect(row?.decidedBy.origin).toBe("computed");
		expect(row?.id.origin).toBe("site");
	});
});

/** The same document with the action's change output speaking, silent, or gone entirely. */
function changeSaying(confidential: boolean | undefined | "absent"): Record<string, unknown> {
	const document = structuredClone(p2pkManifest) as unknown as Record<string, unknown>;
	const outputs = (
		document as unknown as { actions: { Receive: { outputs: Record<string, unknown>[] } } }
	).actions.Receive.outputs;

	if (confidential === "absent") {
		outputs.pop();

		return document;
	}

	const output = outputs[1]!;

	if (confidential === undefined) {
		delete output.confidential;
	} else {
		output.confidential = confidential;
	}

	return document;
}

/**
 * The one place this wallet answers over the format instead of under it.
 *
 * A contract action's own change is published so the money returns in a form the next action
 * can be funded from. The amount is on the chain as a result, and what the wallet owes in
 * return is to say so — naming the word it set aside rather than overriding a protocol quietly.
 */
describe("what a person is told about an amount this wallet published", () => {
	async function published(manifest: Record<string, unknown>) {
		return (await shown(manifest)).publishedAmounts.map((row) => ({
			id: row.id.value,
			reason: row.reason.value,
		}));
	}

	// Every change output in the published corpus is this case: not one document says anything
	// about its change, and this network answers that silence by hiding.
	test("naming the network's own default, which is what the whole corpus leaves it to", async () => {
		expect(await published(changeSaying(undefined))).toEqual([
			{
				id: "change",
				reason:
					"nothing says otherwise and this network hides an output by default, and this " +
					"wallet publishes it anyway so your next action can spend it",
			},
		]);
	});

	// A different sentence for a different word, which is the whole reason the word is carried:
	// a protocol that asked outright and one that never spoke build the same output here and
	// are not the same thing to someone deciding whether to trust the site.
	test("naming the protocol's own word when it asked for hidden change outright", async () => {
		expect(await published(changeSaying(true))).toEqual([
			{
				id: "change",
				reason:
					"this protocol asks for it to be hidden, and this wallet publishes it anyway so " +
					"your next action can spend it",
			},
		]);
	});

	// An action declaring no change output still gets one, because the module appends it, and
	// the document's silence about an output it never declared is answered the same way.
	test("and says it even where the document declares no change at all", async () => {
		expect(await published(changeSaying("absent"))).toEqual([
			{
				id: "change",
				reason:
					"nothing says otherwise and this network hides an output by default, and this " +
					"wallet publishes it anyway so your next action can spend it",
			},
		]);
	});

	// The change is not on the hidden list any more, and that is not an omission: it is not
	// hidden, and the line above is where it says so instead.
	test("and no longer counts that change among the amounts it hides", async () => {
		const model = await shown(changeSaying(undefined));

		expect(model.hiddenAmounts.map((row) => row.id.value)).not.toContain("fee_change");
	});
});

/**
 * The model has to cross a boundary that cannot carry a bigint.
 *
 * The confirmation travels over a message bus that serializes as JSON, and `JSON.stringify`
 * throws on a bigint rather than losing it. Amounts stay bigint everywhere they are computed
 * and become strings only here, which is the one place the loss is a formatting concern
 * rather than an arithmetic one — and the origin travels with them.
 */
describe("the model as it crosses to a surface", () => {
	test("writes every amount as a decimal string", async () => {
		const result = await reviewed();
		const crossed = toShownConfirmation(result.confirmation);

		expect(crossed.feeSats.value).toBe(result.estimatedFeeSats.toString());
		expect(crossed.netEffect[0]?.sats.value).toBe(
			result.confirmation.netEffect[0]?.sats.value.toString(),
		);
	});

	test("and survives the encoding the bus actually uses", async () => {
		const crossed = toShownConfirmation((await reviewed()).confirmation);

		expect(JSON.parse(JSON.stringify(crossed)).account.value).toBe(ACCOUNT);
	});

	test("keeping each value's origin, which is the whole reason it is carried", async () => {
		const crossed = toShownConfirmation((await reviewed()).confirmation);

		expect(crossed.feeSats.origin).toBe("computed");
		expect(crossed.netEffect[0]?.sats.origin).toBe("computed");
		expect(crossed.protocol.origin).toBe("site");
	});
});
