import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import p2pkManifest from "../__fixtures__/p2pk.manifest.json";
import type { TxOutAtOutPoint } from "../chain/chainRead";
import { estimateFeeSats } from "../fee";
import { isRefusal, reviewManifestAction, toShownConfirmation } from "../index";
import type { ParsedLiquidProcessCtParams } from "../request/request";

const SOURCE_PATH = "./p2pk.simf";
const SOURCE = readFileSync(new URL("../__fixtures__/p2pk.simf", import.meta.url), "utf8");
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const TXID = "b".repeat(64);
const MANIFEST = p2pkManifest as unknown as Record<string, unknown>;

const DERIVED = "tex1p_derived";
const DERIVED_SCRIPT = `5120${"11".repeat(32)}`;
const ELSEWHERE_SCRIPT = `5120${"22".repeat(32)}`;

const POLICY_ASSET = "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49";
const WALLET_SCRIPT = `0014${"33".repeat(20)}`;
const ACCOUNT = "liquid:testnet account 0";
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
	txOutHex: `01${"aa".repeat(32)}01000000000000c350000022${"00".repeat(34)}`,
});

const oneCovenantUtxo = { utxos: [{ txid: TXID, utxo_type: "p2pk_output", vout: 0 }] };

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
		expect(model.feeSats.origin).toBe("computed");
	});

	test("and that figure is what this shape costs at the rate it read", async () => {
		const result = await reviewed();

		expect(result.confirmation.feeSats.value).toBe(result.estimatedFeeSats);
		expect(result.estimatedFeeSats).toBe(
			estimateFeeSats(
				{
					blindedOutputs:
						result.outputs.filter((output) => output.blinded).length +
						(result.changeBlinded ? 1 : 0),
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

	test("shows the balance change per asset, as the wallet's own finding", async () => {
		const model = await shown();

		expect(model.netEffect).toHaveLength(1);
		expect(model.netEffect[0]?.asset).toMatchObject({ origin: "computed", value: POLICY_ASSET });
		expect(model.netEffect[0]?.sats.origin).toBe("computed");
	});

	test("and that change is the covenant's holding back, less what the fee takes", async () => {
		const result = await reviewed();

		expect(result.confirmation.netEffect[0]?.sats.value).toBe(
			BigInt(COVENANT_HOLDS) - result.estimatedFeeSats,
		);
	});

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

describe("what the dapp merely said", () => {
	test("the protocol's name is the dapp's", async () => {
		expect((await shown()).protocol).toMatchObject({ origin: "dapp", value: "p2pk-simplicity" });
	});

	test("the action's name is the dapp's", async () => {
		expect((await shown()).action).toMatchObject({ origin: "dapp", value: "Receive" });
	});

	test("the protocol's own summary is the dapp's", async () => {
		expect((await shown()).summary?.origin).toBe("dapp");
		expect((await shown()).summary?.value).toContain("Spend a p2pk output");
	});

	test("and so is its word for what kind of output a covenant is", async () => {
		expect((await shown()).covenants[0]?.utxoType).toMatchObject({
			origin: "dapp",
			value: "p2pk_output",
		});
	});
});

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

	test("and says nothing about an output the protocol leaves in the open", async () => {
		expect((await hidden(saying(false))).map((row) => row.id)).not.toContain("received_out");
	});

	test("the sentence is the wallet's and the name beside it is the dapp's", async () => {
		const [row] = (await shown(saying(true))).hiddenAmounts;

		expect(row?.decidedBy.origin).toBe("computed");
		expect(row?.id.origin).toBe("dapp");
	});
});

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

describe("what a person is told about an amount this wallet published", () => {
	async function published(manifest: Record<string, unknown>) {
		return (await shown(manifest)).publishedAmounts.map((row) => ({
			id: row.id.value,
			reason: row.reason.value,
		}));
	}

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

	test("and no longer counts that change among the amounts it hides", async () => {
		const model = await shown(changeSaying(undefined));

		expect(model.hiddenAmounts.map((row) => row.id.value)).not.toContain("fee_change");
	});
});

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
		expect(crossed.protocol.origin).toBe("dapp");
	});
});
