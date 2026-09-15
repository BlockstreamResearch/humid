import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import type { TxOutAtOutPoint } from "../chain/chainRead";
import { isRefusal, reviewManifestAction } from "../index";
import type { ParsedLiquidProcessCtParams } from "../request/request";

/**
 * What a covenant spend has to carry out of the review, and in what order.
 *
 * Everything here is about the difference between "the wallet checked this covenant" and "the
 * wallet can spend it". The second needs the source, the arguments, the leaves, the mode, the
 * bytes at the outpoint, the witness values the document states and the name of the witness a
 * signature goes in — and it needs them in the place the document says the input goes, because
 * a covenant that reads its own index will not run anywhere else.
 *
 * The published p2pk manifest and its contract source, unmodified. It is the thinnest real
 * protocol there is: one covenant, one signature witness, and no deployment.
 */
const SOURCE_PATH = "./p2pk.simf";
const SOURCE = readFileSync(new URL("../__fixtures__/p2pk.simf", import.meta.url), "utf8");
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const TXID = "b".repeat(64);
const MANIFEST = p2pkManifest as unknown as Record<string, unknown>;

const DERIVED = "tex1p_derived";
const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;
const FUNDING_TXID = "c".repeat(64);
/** One explicit output holding the covenant's balance, written the way the chain writes one. */
const COVENANT_TXOUT = `01${"aa".repeat(32)}01000000000000c350000022${"00".repeat(34)}`;

const deps = {
	accountLabel: "liquid:testnet account 0",
	compile: () => ({ address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT }),
	fundingUtxos: [{ amount: "1000000", spendable: true, txOut: "00", txid: FUNDING_TXID, vout: 0 }],
	network: "liquid",
	policyAsset: POLICY_ASSET,
	readFeeRate: async () => 1000,
	readTxOut: async (): Promise<TxOutAtOutPoint> => ({
		amountSats: "50000",
		rawAssetId: POLICY_ASSET,
		scriptPubKeyHex: DERIVED_SCRIPT,
		txOutHex: COVENANT_TXOUT,
	}),
	scriptPubKeyOf: () => DERIVED_SCRIPT,
	walletScriptPubKeyHex: WALLET_SCRIPT,
};

const spendRequest = (manifest: unknown = MANIFEST): ParsedLiquidProcessCtParams => ({
	action: "Receive",
	broadcast: false,
	contractSources: { [SOURCE_PATH]: SOURCE },
	manifest: manifest as Record<string, unknown>,
	params: { pubkey: PUBKEY },
	state: { utxos: [{ txid: TXID, utxo_type: "p2pk_output", vout: 0 }] },
});

/** The fixture with one action rewritten, so a case can state what the document does not. */
function withReceiveInputs(inputs: unknown[]): Record<string, unknown> {
	const document = structuredClone(MANIFEST) as Record<string, unknown>;
	const actions = document.actions as Record<string, Record<string, unknown>>;

	actions.Receive = { ...actions.Receive, inputs };

	return document;
}

/** The same, for an action whose outputs a case has to state as well as its inputs. */
function withReceive(inputs: unknown[], outputs: unknown[]): Record<string, unknown> {
	const document = structuredClone(MANIFEST) as Record<string, unknown>;
	const actions = document.actions as Record<string, Record<string, unknown>>;

	actions.Receive = { ...actions.Receive, inputs, outputs };

	return document;
}

const receiveInputs = () =>
	structuredClone(
		(MANIFEST.actions as Record<string, Record<string, unknown>>).Receive.inputs,
	) as Record<string, unknown>[];

async function reviewed(request = spendRequest(), overrides: Record<string, unknown> = {}) {
	const result = await reviewManifestAction(request, { ...deps, ...overrides });

	if (isRefusal(result)) {
		throw new Error(`Refused: ${result.reason}`);
	}

	return result;
}

describe("what the review carries out about a covenant it will spend", () => {
	test("carries the exact source, arguments, leaves and mode it checked against the chain", async () => {
		const review = await reviewed();

		// Every one of these decides the script the covenant locks to. A spend compiled from a
		// second reading of the request could differ in any of them and would produce a
		// different script, which the covenant's own execution rejects after a person has
		// already approved the transaction the wallet checked.
		expect(review.covenantInputs).toEqual([
			{
				argumentsJson: JSON.stringify({ PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` } }),
				extraLeavesJson: "[]",
				id: "p2pk_in",
				includeDebugSymbols: false,
				signatureWitness: "SIGNATURE",
				source: SOURCE,
				txOutHex: COVENANT_TXOUT,
				txid: TXID,
				utxoType: "p2pk_output",
				vout: 0,
			},
		]);
	});

	// The signature is over a transaction that does not exist until the wallet has assembled
	// it, so nothing the request supplies could fill this witness. Without the name, the spend
	// fails at signing rather than anywhere a person could act on.
	test("names the witness a signature must fill, from the document's own declaration", async () => {
		expect((await reviewed()).covenantInputs[0]?.signatureWitness).toBe("SIGNATURE");
	});

	test("names no signature witness where the document declares none", async () => {
		const inputs = receiveInputs();
		const covenantInput = inputs[0];

		delete covenantInput?.witnesses;

		const review = await reviewed(spendRequest(withReceiveInputs(inputs)));

		expect(review.covenantInputs[0]?.signatureWitness).toBeUndefined();
	});

	// A value the document states outright is how a covenant with more than one branch is told
	// which to run. It travels unparsed: the compiler that type-checks a SimplicityHL literal
	// is the authority on what it means, and this package is not.
	test("carries a stated witness value through without reading it", async () => {
		const inputs = receiveInputs();

		inputs[0] = {
			...inputs[0],
			witnesses: {
				BRANCH: {
					simplicity_type: "Either<(), ()>",
					type: "simplicityhl",
					value: "Left(())",
				},
			},
		};

		const review = await reviewed(spendRequest(withReceiveInputs(inputs)));

		expect(review.covenantInputs[0]?.witnessValues).toEqual([
			{ name: "BRANCH", simplicityType: "Either<(), ()>", value: "Left(())" },
		]);
	});
});

describe("the order the transaction's inputs are built in", () => {
	test("is the order the action declares them, covenant and wallet alike", async () => {
		const review = await reviewed();

		// The document declares the covenant first and the fee input second, so that is the
		// order. Adding every covenant first and the wallet's own after would happen to agree
		// here, which is why the reversed case below exists.
		expect(review.inputOrder.map((planned) => planned.source)).toEqual(["covenant", "wallet"]);
		expect(review.inputOrder[0]).toEqual({
			covenant: review.covenantInputs[0]!,
			source: "covenant",
		});
		expect(review.inputOrder[1]).toEqual({
			source: "wallet",
			utxo: review.selected[0]!,
		});
	});

	// A contract asserting its own index will not run against a transaction built the other
	// way, and nothing after signing could say why. So a stated position moves the covenant.
	test("honours a stated position that puts the wallet's own input first", async () => {
		const inputs = receiveInputs();

		inputs[0] = { ...inputs[0], required_index: 1 };
		inputs[1] = { ...inputs[1], required_index: 0 };

		const review = await reviewed(spendRequest(withReceiveInputs(inputs)));

		expect(review.inputOrder.map((planned) => planned.source)).toEqual(["wallet", "covenant"]);
	});

	// `selected` says which of the wallet's outputs the transaction spends. It is not the
	// order: once a covenant input is in the transaction the two are different lists, and a
	// caller that read one as the other would add the wallet's outputs in the covenant's place.
	test("reports the wallet's own outputs separately from the order", async () => {
		const review = await reviewed();

		expect(review.selected).toHaveLength(1);
		expect(review.selected[0]?.txid).toBe(FUNDING_TXID);
		expect(review.inputOrder).toHaveLength(2);
	});
});

describe("the transaction-level facts a covenant spend needs", () => {
	// A branch guarded by a lock height reads the transaction's own locktime, and one that
	// declares none satisfies no such branch. The wallet answers with where the chain is, which
	// is what every wallet writes there and says nothing about any protocol.
	test("declares the chain's height as a locktime when a covenant is spent", async () => {
		const review = await reviewed(spendRequest(), { readChainTip: async () => 3_210_987 });

		expect(review.locktimeHeight).toBe(3_210_987);
	});

	test("declares none for an action that spends no covenant", async () => {
		const review = await reviewed(
			{
				action: "Pay",
				broadcast: false,
				contractSources: { [SOURCE_PATH]: SOURCE },
				manifest: MANIFEST,
				params: { amount_sat: 1000, pubkey: PUBKEY },
			},
			{ readChainTip: async () => 3_210_987 },
		);

		expect(review.locktimeHeight).toBeUndefined();
	});

	// A failure to read the tip is not a reason to refuse an action whose covenants are not
	// time-locked. The branch that needs a height fails at execution naming itself, which is a
	// better answer than refusing everything because one network call did not come back.
	test("builds without one rather than refusing when the tip cannot be read", async () => {
		const review = await reviewed(spendRequest(), {
			readChainTip: async () => {
				throw new Error("404");
			},
		});

		expect(review.locktimeHeight).toBeUndefined();
		expect(review.covenantInputs).toHaveLength(1);
	});

	test("carries the one sequence the action declares", async () => {
		const inputs = receiveInputs();

		inputs[0] = { ...inputs[0], sequence: 4_294_967_294 };

		const review = await reviewed(spendRequest(withReceiveInputs(inputs)));

		expect(review.sequence).toBe(4_294_967_294);
	});

	test("carries none where the action declares none", async () => {
		expect((await reviewed()).sequence).toBeUndefined();
	});
});

/**
 * A covenant that also creates an asset, which the module has one call for.
 *
 * The point of these is the outpoint. An asset id is a function of the output its issuing input
 * spends, and the output a covenant input spends is the covenant — named by the state file and
 * confirmed against the chain. Deriving it from one of the wallet's own outputs instead produces
 * a well-formed id for an asset keyed to an output this input has nothing to do with, quietly
 * commits the transaction to spending that output too, and leaves the module's covenant-issuance
 * call unreachable: the person is shown an asset the transaction would not create.
 */
describe("a covenant input that issues an asset", () => {
	const issuingDocument = () => {
		const inputs = receiveInputs();

		inputs[0] = { ...inputs[0], issuance: { asset_amount_sat: 1000, kind: "new" } };

		return withReceive(inputs, [
			{
				amount_sat: "p2pk_in.amount_sat",
				asset: "lbtc",
				description: "The reclaimed funds, sent to your wallet.",
				destination: "wallet",
				id: "received_out",
			},
			{
				amount_sat: 1000,
				asset: "p2pk_in.asset",
				description: "The units this action mints.",
				destination: "wallet",
				id: "minted_out",
			},
			{
				asset: "lbtc",
				description: "L-BTC change from the fee input.",
				destination: "change",
				id: "fee_change",
				optional: true,
			},
		]);
	};

	test("derives the asset from the covenant's own outpoint, not one of the wallet's", async () => {
		const review = await reviewed(spendRequest(issuingDocument()));

		expect(review.issuances).toHaveLength(1);
		expect(review.issuances[0]?.inputId).toBe("p2pk_in");
		expect(review.issuances[0]?.outpoint).toEqual({ txid: TXID, vout: 0 });
	});

	// The covenant's outpoint is not in the wallet's funding pool, so nothing of the wallet's is
	// set aside for it. What is selected is what the fee needs and no more.
	test("reserves none of the wallet's own outputs for it", async () => {
		const review = await reviewed(spendRequest(issuingDocument()));

		expect(review.selected.every((utxo) => utxo.txid === FUNDING_TXID)).toBe(true);
		expect(review.selected.some((utxo) => utxo.txid === TXID)).toBe(false);
	});

	// And the input the issuance sits on is the covenant, in the order the transaction is built
	// in. That is what makes the module's covenant-issuance call reachable: whoever drives the
	// builder joins the two on this outpoint, and a wallet input there would take the other call.
	test("appears in the order as the covenant, at the covenant's outpoint", async () => {
		const review = await reviewed(spendRequest(issuingDocument()));
		const planned = review.inputOrder.find(
			(entry) => entry.source === "covenant" && entry.covenant.id === "p2pk_in",
		);

		expect(planned).toBeDefined();
		expect(planned?.source === "covenant" && planned.covenant.txid).toBe(TXID);
		expect(planned?.source === "covenant" && planned.covenant.vout).toBe(0);
		expect(review.issuances[0]?.outpoint).toEqual({
			txid: planned?.source === "covenant" ? planned.covenant.txid : "",
			vout: planned?.source === "covenant" ? planned.covenant.vout : -1,
		});
	});

	// The asset the input creates reads under its own name, which is how a document pays the
	// units out. It is the issued asset rather than the one the spent covenant held.
	test("lets the action pay out the units under the input's own name", async () => {
		const review = await reviewed(spendRequest(issuingDocument()));
		const minted = review.outputs.find((output) => output.id === "minted_out");

		expect(minted?.asset).toBe(review.issuances[0]?.asset);
		expect(minted?.sats).toBe(1000n);
	});
});
