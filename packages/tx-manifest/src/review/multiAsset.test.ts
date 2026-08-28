import { describe, expect, test } from "bun:test";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import type { TxOutAtOutPoint } from "../chain/chainRead";
import { txOutAt } from "../chain/txOut";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import type { SelectableUtxo } from "./coinSelection";
import { isRefusal, reviewManifestAction } from "./index";

/**
 * The corpus's simplest spend, moving a second asset the way the corpus's own swaps do.
 *
 * `dex.manifest.json` and `lending_v3.manifest.json` both settle in two assets at once, and
 * both write it the same way: an input in the second asset stated as a lookup, an output
 * paying it, and a change output in that same asset beside the one for the fee. That shape is
 * what is added here — to `p2pk`, because it is the one published document this runtime can
 * compile end to end today. The real ones are read where they can be read without a compiler,
 * in `evaluation/assetLedger.test.ts`, and the arithmetic under both is the same.
 *
 * An asset is stated as a lookup rather than as an id because that is what every published
 * protocol does, and because a document naming an id outright is still refused from the
 * document alone.
 */
const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const TOKEN = "aa".repeat(32);
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const SOURCE_PATH = "./p2pk.simf";
const SOURCE =
	"fn main() { jet::bip_0340_verify((param::PUB_KEY, jet::sig_all_hash()), witness::SIGNATURE) }";
const COVENANT_TXID = "b".repeat(64);
const COVENANT_SATS = 42_000n;
const TOKEN_PAID = 250_000n;
const DERIVED = "tex1p_derived";
const DERIVED_SCRIPT = "5120" + "11".repeat(32);
const WALLET_SCRIPT = "0014" + "11".repeat(20);

/** `Receive`, with a second asset paid through it in the shape the two-asset corpus uses. */
function swapManifest() {
	const document = structuredClone(p2pkManifest) as unknown as {
		actions: {
			Receive: {
				inputs: Record<string, unknown>[];
				outputs: Record<string, unknown>[];
				params: Record<string, unknown>;
			};
		};
	};
	const receive = document.actions.Receive;

	receive.params.token = { description: "The asset being paid.", type: "liquid.asset_id" };
	receive.params.paid = { description: "How much of it.", type: "u64" };
	receive.inputs.push({
		asset: "params.token",
		description: "The taker's own outputs in the asset being paid.",
		id: "payment_in",
		utxo_source: "wallet",
	});
	receive.outputs.unshift({
		amount_sat: "params.paid",
		asset: "params.token",
		confidential: false,
		description: "The payment, locked where the protocol wants it.",
		destination: { compile_params: { PUB_KEY: "params.pubkey" }, utxo_type: "p2pk_output" },
		id: "payment_out",
	});
	receive.outputs.push({
		asset: "params.token",
		description: "What is left of the payment asset, back to the wallet.",
		destination: "change",
		id: "payment_change",
		optional: true,
	});

	return document as unknown as Record<string, unknown>;
}

function utxo(amount: string, txid: string): SelectableUtxo {
	return { amount, spendable: true, txid: txid.padStart(64, "0"), txOut: "00", vout: 0 };
}

/**
 * The same output as a different object.
 *
 * A wallet answers "what do I hold" from its own snapshot and builds the list fresh each time,
 * so two answers to the same question describe the same outputs and share no identity. Every
 * substitute here does the same, because a substitute that returned the same objects twice
 * would make an identity comparison look correct.
 */
function again(one: SelectableUtxo): SelectableUtxo {
	return { ...one };
}

/**
 * A chain read that answers with real bytes for an output in a chosen asset.
 *
 * The serialised output goes back through the parser the production reader uses, so an asset
 * this substitute writes wrongly fails here rather than passing through green.
 */
const readTxOut = (asset: string, amountSats: bigint) => async (): Promise<TxOutAtOutPoint> => {
	const committed = `01${(asset.match(/../g) ?? []).toReversed().join("")}`;
	const value = `01${amountSats.toString(16).padStart(16, "0")}`;
	const script = `${(DERIVED_SCRIPT.length / 2).toString(16).padStart(2, "0")}${DERIVED_SCRIPT}`;
	const parsed = txOutAt(`02000000000001${committed}${value}00${script}00000000`, 0);

	if (!parsed.ok) {
		throw new Error(`This substitute built an output the parser cannot read: ${parsed.reason}`);
	}

	return parsed.txOut;
};

const request: ParsedLiquidProcessCtParams = {
	action: "Receive",
	broadcast: false,
	contractSources: { [SOURCE_PATH]: SOURCE },
	manifest: swapManifest(),
	params: { paid: TOKEN_PAID.toString(), pubkey: PUBKEY, token: TOKEN },
	state: { utxos: [{ txid: COVENANT_TXID, utxo_type: "p2pk_output", vout: 0 }] },
};

function settle(
	holdings: Record<string, SelectableUtxo[]>,
	overrides: { holdingsOf?: undefined } = {},
) {
	return reviewManifestAction(request, {
		accountLabel: "liquid:testnet account 0",
		compile: () => ({ address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT }),
		compilerVersion: "0.6.0",
		fundingUtxos: holdings[POLICY_ASSET] ?? [],
		holdingsOf: (asset) => holdings[asset] ?? [],
		network: "liquid",
		policyAsset: POLICY_ASSET,
		readFeeRate: async () => 1000,
		readTxOut: readTxOut(POLICY_ASSET, COVENANT_SATS),
		scriptPubKeyOf: () => DERIVED_SCRIPT,
		walletScriptPubKeyHex: WALLET_SCRIPT,
		...overrides,
	});
}

/** Enough of both, with the payment asset over-supplied so change is required. */
const FUNDED = {
	[POLICY_ASSET]: [utxo("1000000", "c")],
	[TOKEN]: [utxo("400000", "d")],
};

describe("an action that moves more than one asset", () => {
	test("is funded in each asset out of what the wallet holds in that asset", async () => {
		const result = await settle(FUNDED);

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		// One from each pool, in the order the action declares the inputs that need them. A
		// wallet keeping one running total would have taken both out of one pool.
		expect(result.selected.map((selected) => selected.amount)).toEqual(["1000000", "400000"]);
	});

	test("returns the change for each asset separately, and for the exact amount left", async () => {
		const result = await settle(FUNDED);

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		// 400000 put in, 250000 paid. What is left comes back in the asset it went in as, and the
		// figure is exact because nothing takes a fee out of it.
		expect(result.outputs.find((output) => output.id === "payment_change")).toMatchObject({
			asset: TOKEN,
			sats: 150_000n,
			scriptPubKeyHex: WALLET_SCRIPT,
		});
		// The network's own change is not among them: that one is the signing module's, and its
		// amount is not known until the signed transaction has been weighed.
		expect(result.outputs.map((output) => output.id)).not.toContain("fee_change");
	});

	test("pays each output in the asset the document states for it", async () => {
		const result = await settle(FUNDED);

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		expect(Object.fromEntries(result.outputs.map((output) => [output.id, output.asset]))).toEqual({
			payment_change: TOKEN,
			payment_out: TOKEN,
			received_out: POLICY_ASSET,
		});
	});

	test("says what it is paying in, one line per asset", async () => {
		const result = await settle(FUNDED);

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		const effects = Object.fromEntries(
			result.confirmation.netEffect.map((effect) => [effect.asset.value, effect.sats.value]),
		);

		// Two sentences and no sum of them: the payment leaves in one asset, and the covenant's
		// own balance arrives in the other, less the fee.
		expect(effects[TOKEN]).toBe(-TOKEN_PAID);
		expect(effects[POLICY_ASSET]).toBe(COVENANT_SATS - result.estimatedFeeSats);
	});

	// The covenant already holds what the action pays out in that asset, so the wallet funds
	// none of it. Netting per asset is what makes that visible; one total demanded the wallet
	// hold the whole balance again in order to reclaim it.
	test("counts what the covenant it spends already holds against what the outputs cost", async () => {
		const result = await settle({ ...FUNDED, [POLICY_ASSET]: [utxo("6000", "c")] });

		// Six thousand covers the fee and nothing like the covenant's own forty-two.
		expect(isRefusal(result)).toBe(false);
	});
});

describe("when the wallet cannot fund one of them", () => {
	test("it refuses before signing and names the asset it is short of", async () => {
		const result = await settle({ ...FUNDED, [TOKEN]: [utxo("1000", "d")] });

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("shortfall");
			expect(result.reason).toContain(TOKEN);
			expect(result.reason).toContain("1000");
			// The fee is charged in one asset, so a shortfall in another is never explained by it.
			expect(result.reason).not.toContain("fee");
		}
	});

	test("holding none of it at all is the same refusal, not a different one", async () => {
		const result = await settle({ [POLICY_ASSET]: [utxo("1000000", "c")] });

		expect(isRefusal(result) && result.reason).toContain(TOKEN);
	});

	// A wallet full of money and empty of the token is the case one running total could not
	// tell apart from a wallet with no money at all.
	test("being short of the network's own asset still says so in its own terms", async () => {
		const result = await settle({ ...FUNDED, [POLICY_ASSET]: [] });

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("shortfall");
			expect(result.reason).toContain("pay its fee");
		}
	});

	test("a wallet that cannot look up another asset is short of it, not refused for it", async () => {
		const result = await settle(FUNDED, { holdingsOf: undefined });

		expect(isRefusal(result) && result.reject).toBe("shortfall");
		expect(isRefusal(result) && result.reason).toContain(TOKEN);
	});

	// Selection can overshoot, and an asset with no declared change output has nowhere for the
	// overshoot to go. Building it anyway would destroy the difference.
	test("refuses an asset whose surplus the document declares nowhere to return", async () => {
		const document = structuredClone(request.manifest) as unknown as {
			actions: { Receive: { outputs: Record<string, unknown>[] } };
		};

		document.actions.Receive.outputs = document.actions.Receive.outputs.filter(
			(output) => output.id !== "payment_change",
		);

		const result = await reviewManifestAction(
			{ ...request, manifest: document as unknown as Record<string, unknown> },
			{
				accountLabel: "liquid:testnet account 0",
				compile: () => ({ address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT }),
				compilerVersion: "0.6.0",
				fundingUtxos: FUNDED[POLICY_ASSET] ?? [],
				holdingsOf: (asset) => FUNDED[asset] ?? [],
				network: "liquid",
				policyAsset: POLICY_ASSET,
				readFeeRate: async () => 1000,
				readTxOut: readTxOut(POLICY_ASSET, COVENANT_SATS),
				scriptPubKeyOf: () => DERIVED_SCRIPT,
				walletScriptPubKeyHex: WALLET_SCRIPT,
			},
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reason).toContain("150000");
			expect(result.reason).toContain(TOKEN);
		}
	});
});

/**
 * Where a funded input lands, which the document decides and the wallet no longer does.
 *
 * A covenant introspects positions, so where an input sits is part of what the document says.
 * The wallet used to add every covenant first and its own outputs after, which meant an input it
 * supplies could only ever land after every covenant — and the published contracts fix one at
 * index zero. Now the stated positions are taken first and everything else fills what is left,
 * so the order comes from the document wherever it states one.
 */
describe("a funded input at a stated position", () => {
	function withStatedIndex(at: number, alsoOnCovenant?: number) {
		const document = structuredClone(request.manifest) as unknown as {
			actions: { Receive: { inputs: Record<string, unknown>[] } };
		};
		const payment = document.actions.Receive.inputs.find((input) => input.id === "payment_in");
		const covenant = document.actions.Receive.inputs.find((input) => input.id === "p2pk_in");

		if (!payment || !covenant) {
			throw new Error("the fixture declares no payment_in beside its covenant");
		}

		payment.required_index = at;

		if (alsoOnCovenant !== undefined) {
			covenant.required_index = alsoOnCovenant;
		}

		return { ...request, manifest: document as unknown as Record<string, unknown> };
	}

	function review(at: number, holdings: Record<string, SelectableUtxo[]>, alsoOnCovenant?: number) {
		return reviewManifestAction(withStatedIndex(at, alsoOnCovenant), {
			accountLabel: "liquid:testnet account 0",
			compile: () => ({ address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT }),
			compilerVersion: "0.6.0",
			fundingUtxos: holdings[POLICY_ASSET] ?? [],
			holdingsOf: (asset) => holdings[asset] ?? [],
			network: "liquid",
			policyAsset: POLICY_ASSET,
			readFeeRate: async () => 1000,
			readTxOut: readTxOut(POLICY_ASSET, COVENANT_SATS),
			scriptPubKeyOf: () => DERIVED_SCRIPT,
			walletScriptPubKeyHex: WALLET_SCRIPT,
		});
	}

	/** The transaction's inputs by name: a covenant by its id, one of the wallet's by its txid. */
	async function inputsOf(
		at: number,
		holdings: Record<string, SelectableUtxo[]>,
	): Promise<string[]> {
		const result = await review(at, holdings);

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		return result.inputOrder.map((planned) =>
			planned.source === "covenant" ? planned.covenant.id : planned.utxo.txid.replace(/^0+/, ""),
		);
	}

	// One covenant, then the output chosen for the fee, then the payment: the third input,
	// exactly where the document says it must be and where the wallet would have put it anyway.
	test("lands after the covenants and after the assets declared before it", async () => {
		expect(await inputsOf(2, FUNDED)).toEqual(["p2pk_in", "c", "d"]);
	});

	// The case the wallet used to refuse outright. Nothing about a covenant makes it the first
	// input; the published contracts that fix an index fix it on an input the wallet supplies,
	// and one of them fixes it at zero.
	test("lands ahead of the covenant when the document says it goes first", async () => {
		expect(await inputsOf(0, FUNDED)).toEqual(["d", "p2pk_in", "c"]);
	});

	test("and between the covenant and the fee when the document says it goes second", async () => {
		expect(await inputsOf(1, FUNDED)).toEqual(["p2pk_in", "d", "c"]);
	});

	// Two outputs chosen for the asset declared before it used to push it along by one and be
	// refused for it. What the wallet chooses for an input nothing states a position for is the
	// wallet's own business, so those two go around the one the document did place.
	test("keeps its place when the asset before it takes more than one output", async () => {
		expect(
			await inputsOf(2, { ...FUNDED, [POLICY_ASSET]: [utxo("900", "c"), utxo("880", "e")] }),
		).toEqual(["p2pk_in", "c", "d", "e"]);
	});

	test("is refused by name when it asks for a place past the end of the transaction", async () => {
		const result = await review(7, FUNDED);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("unbuildable-position");
			expect(result.reason).toContain("payment_in");
		}
	});

	// Placing is not a way to stop refusing. Two inputs cannot both be input one, in any order,
	// and the one that does not get it is named rather than quietly moved.
	test("and by name when the covenant claims the same place it does", async () => {
		const result = await review(1, FUNDED, 1);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("unbuildable-position");
			expect(result.reason).toContain("payment_in");
		}
	});
});

// A wallet answers "what do I hold in this asset" from its own snapshot, building the list
// fresh each time it is asked. Two answers to the same question therefore share no identity,
// and anything comparing outputs by identity across two of them is comparing nothing.
describe("a wallet that describes its outputs anew each time it is asked", () => {
	/**
	 * The swap with the payment input also minting a token.
	 *
	 * This is the shape the published lending protocol uses: the input carrying an asset is the
	 * same input the asset id is derived from. It makes the wallet ask for that asset's outputs
	 * twice — once to choose the one an issuance commits to, once to fund the rest.
	 */
	function issuingRequest() {
		const document = structuredClone(request.manifest) as unknown as {
			actions: {
				Receive: { inputs: Record<string, unknown>[]; outputs: Record<string, unknown>[] };
			};
		};
		const payment = document.actions.Receive.inputs.find((input) => input.id === "payment_in");

		if (!payment) {
			throw new Error("the fixture declares no payment_in");
		}

		payment.issuance = { asset_amount_sat: 1, inflation_amount_sat: 0, kind: "new" };
		payment.on_resolved = { set: { "instance.MINTED": "asset" } };
		document.actions.Receive.outputs.push({
			amount_sat: 1,
			asset: "instance.MINTED",
			confidential: false,
			description: "The unit this action created.",
			destination: "wallet",
			id: "minted_out",
		});

		return { ...request, manifest: document as unknown as Record<string, unknown> };
	}

	test("spends the output an issuance committed to exactly once", async () => {
		const result = await reviewManifestAction(issuingRequest(), {
			accountLabel: "liquid:testnet account 0",
			compile: () => ({ address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT }),
			compilerVersion: "0.6.0",
			fundingUtxos: FUNDED[POLICY_ASSET] ?? [],
			// Two outputs in the payment asset, so the one an issuance commits to does not cover
			// the payment on its own and the wallet has to come back for more of the same asset.
			// Both described anew, which is what a wallet does: compared by identity, the output
			// already committed to looks like one nobody has taken, and is taken again.
			holdingsOf: (asset) =>
				(asset === TOKEN ? [utxo("200000", "d"), utxo("150000", "e")] : (FUNDED[asset] ?? [])).map(
					again,
				),
			network: "liquid",
			policyAsset: POLICY_ASSET,
			readFeeRate: async () => 1000,
			readTxOut: readTxOut(POLICY_ASSET, COVENANT_SATS),
			scriptPubKeyOf: () => DERIVED_SCRIPT,
			walletScriptPubKeyHex: WALLET_SCRIPT,
		});

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		const outpoints = result.selected.map((selected) => `${selected.txid}:${selected.vout}`);

		expect(result.issuances.length).toBe(1);
		expect(new Set(outpoints).size).toBe(outpoints.length);
	});

	test("is asked once per asset, and spends each output once", async () => {
		let asked = 0;

		const result = await reviewManifestAction(request, {
			accountLabel: "liquid:testnet account 0",
			compile: () => ({ address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT }),
			compilerVersion: "0.6.0",
			fundingUtxos: FUNDED[POLICY_ASSET] ?? [],
			holdingsOf: (asset) => {
				asked += 1;

				return (FUNDED[asset] ?? []).map(again);
			},
			network: "liquid",
			policyAsset: POLICY_ASSET,
			readFeeRate: async () => 1000,
			readTxOut: readTxOut(POLICY_ASSET, COVENANT_SATS),
			scriptPubKeyOf: () => DERIVED_SCRIPT,
			walletScriptPubKeyHex: WALLET_SCRIPT,
		});

		if (isRefusal(result)) {
			throw new Error(result.reason);
		}

		const outpoints = result.selected.map((selected) => `${selected.txid}:${selected.vout}`);

		expect(new Set(outpoints).size).toBe(outpoints.length);
		expect(asked).toBe(1);
	});
});

describe("what the chain says a covenant holds", () => {
	// The document says the covenant is in one asset. If the output it names holds another,
	// funding the stated one from the wallet and stranding what is really there is the one
	// outcome nobody wants, so the disagreement is a refusal.
	test("disagreeing with what the action declares is refused by name", async () => {
		const document = structuredClone(request.manifest) as unknown as {
			actions: { Receive: { inputs: Record<string, unknown>[] } };
		};
		const [covenant] = document.actions.Receive.inputs;

		if (!covenant) {
			throw new Error("the fixture's Receive action declares no inputs");
		}

		covenant.asset = "params.token";

		const result = await reviewManifestAction(
			{ ...request, manifest: document as unknown as Record<string, unknown> },
			{
				accountLabel: "liquid:testnet account 0",
				compile: () => ({ address: DERIVED, scriptPubKeyHex: DERIVED_SCRIPT }),
				compilerVersion: "0.6.0",
				fundingUtxos: FUNDED[POLICY_ASSET] ?? [],
				holdingsOf: (asset) => FUNDED[asset] ?? [],
				network: "liquid",
				policyAsset: POLICY_ASSET,
				readFeeRate: async () => 1000,
				readTxOut: readTxOut(POLICY_ASSET, COVENANT_SATS),
				scriptPubKeyOf: () => DERIVED_SCRIPT,
				walletScriptPubKeyHex: WALLET_SCRIPT,
			},
		);

		expect(isRefusal(result)).toBe(true);

		if (isRefusal(result)) {
			expect(result.reject).toBe("foreign-asset");
			expect(result.reason).toContain("p2pk_in");
		}
	});
});
