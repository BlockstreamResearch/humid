import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import type { TxOutAtOutPoint } from "../chain/chainRead";
import { isRefusal, reviewManifestAction } from "../index";
import type { ParsedLiquidProcessCtParams } from "../request/request";

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

function withReceiveInputs(inputs: unknown[]): Record<string, unknown> {
	const document = structuredClone(MANIFEST) as Record<string, unknown>;
	const actions = document.actions as Record<string, Record<string, unknown>>;

	actions.Receive = { ...actions.Receive, inputs };

	return document;
}

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

	test("honours a stated position that puts the wallet's own input first", async () => {
		const inputs = receiveInputs();

		inputs[0] = { ...inputs[0], required_index: 1 };
		inputs[1] = { ...inputs[1], required_index: 0 };

		const review = await reviewed(spendRequest(withReceiveInputs(inputs)));

		expect(review.inputOrder.map((planned) => planned.source)).toEqual(["wallet", "covenant"]);
	});

	test("reports the wallet's own outputs separately from the order", async () => {
		const review = await reviewed();

		expect(review.selected).toHaveLength(1);
		expect(review.selected[0]?.txid).toBe(FUNDING_TXID);
		expect(review.inputOrder).toHaveLength(2);
	});
});

describe("the transaction-level facts a covenant spend needs", () => {
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

	test("reserves none of the wallet's own outputs for it", async () => {
		const review = await reviewed(spendRequest(issuingDocument()));

		expect(review.selected.every((utxo) => utxo.txid === FUNDING_TXID)).toBe(true);
		expect(review.selected.some((utxo) => utxo.txid === TXID)).toBe(false);
	});

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

	test("lets the action pay out the units under the input's own name", async () => {
		const review = await reviewed(spendRequest(issuingDocument()));
		const minted = review.outputs.find((output) => output.id === "minted_out");

		expect(minted?.asset).toBe(review.issuances[0]?.asset);
		expect(minted?.sats).toBe(1000n);
	});
});
