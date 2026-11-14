import { describe, expect, test } from "bun:test";

import { deriveFromEntropy } from "../chain/issuance";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import {
	DERIVED_SCRIPT,
	PROGRAM_TXOUT,
	type Document,
	Fixture,
	FUNDING_TXID,
	POLICY_ASSET,
	PUBKEY,
	refused,
	reviewed,
	TXID,
} from "./reviewForTests";

const P2PK_PATH = "./p2pk.simf";
const p2pk = Fixture.load("p2pk");

const pay = (overrides: Partial<ParsedLiquidProcessCtParams> = {}) =>
	p2pk.request("Pay", { params: { amount_sat: 1000, pubkey: PUBKEY }, ...overrides });

const receive = (overrides: Partial<ParsedLiquidProcessCtParams> = {}) =>
	p2pk.request("Receive", {
		params: { pubkey: PUBKEY },
		state: { utxos: [{ txid: TXID, utxo_type: "p2pk_output", vout: 0 }] },
		...overrides,
	});

const receiveInputs = () => structuredClone(p2pk.action("Receive").inputs) as Document[];

function withReceive(inputs: unknown[], outputs?: unknown[], allowChange?: string): Document {
	return p2pk.editedAction("Receive", (action) => {
		action.inputs = inputs;

		if (outputs !== undefined) {
			action.outputs = outputs;
		}

		if (allowChange !== undefined) {
			action.allow_change = allowChange;
		}
	}).manifest;
}

const spending = (manifest: Document = p2pk.manifest) => receive({ manifest });

const branchedAbi = () => ({
	parameters: {},
	witnesses: { BRANCH: "Either<(), ()>", SIGNATURE: "[u8; 64]" },
});

describe("what the review carries out about a program it will spend", () => {
	test("carries the witnesses the spend leaves unused, by name", async () => {
		const inputs = receiveInputs();
		const program = inputs[0] as Record<string, unknown>;

		inputs[0] = {
			...program,
			witnesses: { ...(program.witnesses as Record<string, unknown>), OTHER_SIG: "unused" },
		};

		const review = await reviewed(spending(withReceive(inputs)), {
			programAbi: () => ({
				parameters: {},
				witnesses: { OTHER_SIG: "[u8; 64]", SIGNATURE: "[u8; 64]" },
			}),
		});

		expect(review.programInputs[0]?.unusedWitnesses).toEqual(["OTHER_SIG"]);
	});

	test("and carries none where the spend uses every witness", async () => {
		expect((await reviewed(spending())).programInputs[0]?.unusedWitnesses).toBeUndefined();
	});

	test("carries the exact source, arguments, leaves and mode it checked against the chain", async () => {
		const review = await reviewed(spending());

		expect(review.programInputs).toEqual([
			{
				argumentsJson: JSON.stringify({ PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` } }),
				extraLeavesJson: "[]",
				id: "p2pk_in",
				includeDebugSymbols: false,
				signatureWitness: "SIGNATURE",
				source: p2pk.source(P2PK_PATH),
				txOutHex: PROGRAM_TXOUT,
				txid: TXID,
				utxoType: "p2pk_output",
				vout: 0,
			},
		]);
	});

	test("names the witness a signature must fill, from the document's own declaration", async () => {
		expect((await reviewed(spending())).programInputs[0]?.signatureWitness).toBe("SIGNATURE");
	});

	test("names no signature witness where the document declares none", async () => {
		const inputs = receiveInputs();
		const programInput = inputs[0];

		delete programInput?.witnesses;

		const review = await reviewed(spending(withReceive(inputs)), {
			programAbi: () => ({ parameters: {}, witnesses: {} }),
		});

		expect(review.programInputs[0]?.signatureWitness).toBeUndefined();
	});

	test("carries a stated witness value through at the type its program declares", async () => {
		const inputs = receiveInputs();

		inputs[0] = {
			...inputs[0],
			witnesses: { BRANCH: { type: "simplicityhl", value: "Left(())" } },
		};

		const review = await reviewed(spending(withReceive(inputs)), {
			programAbi: () => ({ parameters: {}, witnesses: { BRANCH: "Either<(), ()>" } }),
		});

		expect(review.programInputs[0]?.witnessValues).toEqual([
			{ name: "BRANCH", type: "Either<(), ()>", value: "Left(())" },
		]);
	});

	test("refuses an input that leaves out a witness its program reads, or names one it does not", async () => {
		const left = await refused(spending(), { programAbi: branchedAbi });
		const inputs = receiveInputs();

		inputs[0] = {
			...inputs[0],
			witnesses: { EXTRA: "unused", ...(inputs[0]?.witnesses as object) },
		};

		const extra = await refused(spending(withReceive(inputs)));

		expect(left).toMatchObject({ reject: "document-fault" });
		expect(left.reason).toContain("leaves out the witness BRANCH");
		expect(extra.reason).toContain("names a witness EXTRA");
	});
});

describe("the order the transaction's inputs are built in", () => {
	test("is the order the action declares them, program and wallet alike", async () => {
		const review = await reviewed(spending());

		expect(review.inputOrder.map((planned) => planned.source)).toEqual(["program", "wallet"]);
		expect(review.inputOrder[0]).toEqual({
			program: review.programInputs[0]!,
			source: "program",
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

		const review = await reviewed(spending(withReceive(inputs)));

		expect(review.inputOrder.map((planned) => planned.source)).toEqual(["wallet", "program"]);
	});

	test("reports the wallet's own outputs separately from the order", async () => {
		const review = await reviewed(spending());

		expect(review.selected).toHaveLength(1);
		expect(review.selected[0]?.txid).toBe(FUNDING_TXID);
		expect(review.inputOrder).toHaveLength(2);
	});
});

describe("the transaction-level facts a program spend needs", () => {
	test("declares the chain's height as a locktime when a program is spent", async () => {
		const review = await reviewed(spending(), { readChainTip: async () => 3_210_987 });

		expect(review.locktimeHeight).toBe(3_210_987);
	});

	test("declares none for an action that spends no program", async () => {
		const review = await reviewed(pay(), { readChainTip: async () => 3_210_987 });

		expect(review.locktimeHeight).toBeUndefined();
	});

	test("refuses when the tip cannot be read, rather than building without a locktime", async () => {
		const refusal = await refused(spending(), {
			readChainTip: async () => {
				throw new Error("404");
			},
		});

		expect(refusal.reject).toBe("chain-read-failed");
		expect(refusal.reason).toContain("404");
	});

	test("carries the sequence the action declares on the input that declares it", async () => {
		const inputs = receiveInputs();

		inputs[0] = { ...inputs[0], sequence: 4_294_967_294 };

		const review = await reviewed(spending(withReceive(inputs)));

		expect(review.inputOrder.map((planned) => planned.sequence)).toEqual([
			4_294_967_294,
			undefined,
		]);
	});

	test("carries none where the action declares none", async () => {
		const review = await reviewed(spending());

		expect(review.inputOrder.map((planned) => planned.sequence)).toEqual([undefined, undefined]);
	});

	test("carries a relative timelock where the program input is the only input", async () => {
		const inputs = receiveInputs();

		inputs[0] = { ...inputs[0], sequence: { relative_blocks: 10 } };

		const outputs = [
			{
				amount_sat: 40_000,
				asset: "lbtc",
				description: "The reclaimed funds, sent to your wallet.",
				destination: "wallet",
				id: "received_out",
			},
		];
		const review = await reviewed(spending(withReceive([inputs[0]], outputs, "lbtc_only")));

		expect(review.inputOrder.map((planned) => planned.sequence)).toEqual([10]);
		expect(review.selected).toHaveLength(0);
		expect(review.inputOrder).toHaveLength(1);
	});

	test("keeps a program input's relative timelock off the wallet's fee input", async () => {
		const inputs = receiveInputs();

		inputs[0] = { ...inputs[0], sequence: { relative_blocks: 10 } };

		const review = await reviewed(spending(withReceive(inputs)));

		expect(review.inputOrder.map((planned) => [planned.source, planned.sequence])).toEqual([
			["program", 10],
			["wallet", undefined],
		]);
	});
});

const readRaw = async () => ({
	scriptPubKeyHex: DERIVED_SCRIPT,
	transactionHex: "aa",
	txOutHex: PROGRAM_TXOUT,
});

const readBlinded = async () => ({ scriptPubKeyHex: DERIVED_SCRIPT, txOutHex: PROGRAM_TXOUT });

describe("a program input that spends a blinded output", () => {
	const ONE = `01${"00".repeat(31)}`;
	const TWO = `02${"00".repeat(31)}`;
	const stating = (stated: Record<string, unknown>) => {
		const inputs = receiveInputs();

		inputs[0] = { ...inputs[0], ...stated };

		return spending(withReceive(inputs));
	};

	test("opens the output with the factors and amount the manifest states", async () => {
		const review = await reviewed(
			stating({ amount_sat: 40_000, blinding: { asset_bf: "1", value_bf: "2" } }),
			{ readTxOut: readBlinded },
		);

		expect(JSON.parse(review.programInputs[0]?.blindingSecretsJson ?? "{}")).toEqual({
			asset: POLICY_ASSET,
			assetBlindingFactor: ONE,
			value: "40000",
			valueBlindingFactor: TWO,
		});
		expect(review.outputs.find((output) => output.id === "received_out")?.sats).toBe(40_000n);
	});

	test("and blinds the change, since the network takes a blinded input only with a blinded output", async () => {
		const review = await reviewed(
			stating({ amount_sat: 40_000, blinding: { asset_bf: "1", value_bf: "2" } }),
			{ readTxOut: readBlinded },
		);

		expect(review.outputs.find((output) => output.id === "fee_change")).toMatchObject({
			blinded: true,
			decidedBy: "confidential-input",
		});
	});

	test("refuses one that states only one of the two factors", async () => {
		const refusal = await refused(stating({ amount_sat: 40_000, blinding: { asset_bf: "1" } }), {
			readTxOut: readBlinded,
		});

		expect(refusal.reason).toContain("both");
	});

	test("refuses one that does not state the amount the output holds", async () => {
		const refusal = await refused(stating({ blinding: { asset_bf: "1", value_bf: "2" } }), {
			readTxOut: readBlinded,
		});

		expect(refusal.reason).toContain("amount_sat");
	});

	test("and refuses a blinded output an input states no factors for", async () => {
		const refusal = await refused(spending(), { readTxOut: readBlinded });

		expect(refusal.reject).toBe("unbuildable-utxo-type");
		expect(refusal.reason).toContain("blinding factors");
	});
});

describe("a program input that reissues an asset", () => {
	const ENTROPY = "f8326827828ee2aab3c4d273fb573a8cf89a401bbc6643637d439ff36c60b6b9";
	const ISSUED = "3a8b6b466346d9dbfcecd8c8d7b0c1873aee4e00fd5df0d95086a3f7eecd5a39";
	const TOKEN = deriveFromEntropy(ENTROPY)?.reissuanceToken ?? "";
	const reissuing = (stated: Record<string, unknown>) => {
		const inputs = receiveInputs();

		inputs[0] = {
			...inputs[0],
			asset: TOKEN,
			issuance: { asset_amount_sat: 50, entropy: ENTROPY, issued_asset: ISSUED, kind: "reissue" },
			...stated,
		};

		return spending(
			withReceive(inputs, [
				{ amount_sat: 50, asset: ISSUED, destination: "wallet", id: "minted_out" },
				{ amount_sat: 1, asset: TOKEN, destination: "wallet", id: "token_back" },
				{ asset: "lbtc", destination: "change", id: "fee_change" },
			]),
		);
	};

	test("mints from the blinded token the program holds", async () => {
		const review = await reviewed(
			reissuing({ amount_sat: 1, blinding: { asset_bf: "1", value_bf: "2" } }),
			{ readTxOut: readBlinded },
		);

		expect(review.issuances).toMatchObject([
			{ asset: ISSUED, kind: "reissue", outpoint: { txid: TXID, vout: 0 } },
		]);
		expect(review.outputs.find((output) => output.id === "minted_out")?.sats).toBe(50n);
	});

	test("is refused where the program holds its token in the open, which cannot reissue", async () => {
		expect((await refused(reissuing({}))).reason).toContain(TOKEN);
	});
});

describe("a blinded program output the manifest states no factors for", () => {
	const opened = {
		asset: POLICY_ASSET,
		assetBlindingFactor: `01${"00".repeat(31)}`,
		sats: 40_000n,
		valueBlindingFactor: `02${"00".repeat(31)}`,
	};

	test("is opened with the wallet's own blinding key", async () => {
		const review = await reviewed(spending(), { readTxOut: readRaw, unblind: () => opened });

		expect(JSON.parse(review.programInputs[0]?.blindingSecretsJson ?? "{}")).toMatchObject({
			asset: POLICY_ASSET,
			value: "40000",
		});
		expect(review.outputs.find((output) => output.id === "received_out")?.sats).toBe(40_000n);
	});

	test("but refused where it holds something other than the manifest expects", async () => {
		const inputs = receiveInputs();

		inputs[0] = { ...inputs[0], amount_sat: 1 };

		const refusal = await refused(spending(withReceive(inputs)), {
			readTxOut: readRaw,
			unblind: () => opened,
		});

		expect(refusal.reject).toBe("program-mismatch");
	});

	test("and refused where the wallet's key does not open it", async () => {
		const refusal = await refused(spending(), { readTxOut: readRaw, unblind: () => undefined });

		expect(refusal.reason).toContain("blinded to a key this wallet does not hold");
	});
});

describe("a program input that issues an asset", () => {
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
				asset: "p2pk_in.issued_asset",
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

	test("derives the asset from the program's own outpoint, not one of the wallet's", async () => {
		const review = await reviewed(spending(issuingDocument()));

		expect(review.issuances).toHaveLength(1);
		expect(review.issuances[0]?.inputId).toBe("p2pk_in");
		expect(review.issuances[0]?.outpoint).toEqual({ txid: TXID, vout: 0 });
	});

	test("reserves none of the wallet's own outputs for the issuance", async () => {
		const review = await reviewed(spending(issuingDocument()));

		expect(review.selected.every((utxo) => utxo.txid === FUNDING_TXID)).toBe(true);
		expect(review.selected.some((utxo) => utxo.txid === TXID)).toBe(false);
	});

	test("appears in the order as the program, at the program's outpoint", async () => {
		const review = await reviewed(spending(issuingDocument()));
		const planned = review.inputOrder.find(
			(entry) => entry.source === "program" && entry.program.id === "p2pk_in",
		);

		expect(planned).toBeDefined();
		expect(planned?.source === "program" && planned.program.txid).toBe(TXID);
		expect(planned?.source === "program" && planned.program.vout).toBe(0);
		expect(review.issuances[0]?.outpoint).toEqual({
			txid: planned?.source === "program" ? planned.program.txid : "",
			vout: planned?.source === "program" ? planned.program.vout : -1,
		});
	});

	test("lets the action pay out the units under the input's own name", async () => {
		const review = await reviewed(spending(issuingDocument()));
		const minted = review.outputs.find((output) => output.id === "minted_out");

		expect(minted?.asset).toBe(review.issuances[0]?.asset);
		expect(minted?.sats).toBe(1000n);
	});
});

describe("an action whose only output is change", () => {
	const changeOut = {
		asset: "lbtc",
		description: "Everything the program held, back to your wallet.",
		destination: "change",
		id: "fee_change",
	};
	const receivedOut = {
		amount_sat: 40_000,
		asset: "lbtc",
		description: "The reclaimed funds, sent to your wallet.",
		destination: "wallet",
		id: "received_out",
	};

	test("returns what is left after the fee through the change output the action declares", async () => {
		const review = await reviewed(spending(withReceive(receiveInputs(), [changeOut])));

		expect(review.outputs.map((output) => output.id)).toEqual(["fee_change"]);
	});

	test("and refuses what is left where the action declares no change and allows none", async () => {
		const refusal = await refused(spending(withReceive(receiveInputs(), [receivedOut])));

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("allow_change");
	});

	test("but adds a change output of its own where the action allows undeclared change", async () => {
		const review = await reviewed(
			spending(withReceive(receiveInputs(), [receivedOut], "lbtc_only")),
		);

		expect(review.outputs.map((output) => output.id)).toEqual(["received_out", "change"]);
	});

	test("and refuses an allow_change the format does not define", async () => {
		const refusal = await refused(spending(withReceive(receiveInputs(), [receivedOut], "some")));

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain('"some"');
	});
});

const listed = (txid: string, asset?: string) => ({
	txid,
	utxo_type: "p2pk_output",
	vout: 0,
	...(asset === undefined ? {} : { asset }),
});
const spent = (review: Awaited<ReturnType<typeof reviewed>>) =>
	review.programInputs.map((program) => program.txid[0]);

describe("which program output each input spends", () => {
	const twoPrograms = () => {
		const inputs = receiveInputs();

		return withReceive([inputs[0], { ...inputs[0], id: "p2pk_in_2" }, inputs[1]]);
	};

	test("gives two inputs of one type two different outputs", async () => {
		const request = {
			...spending(twoPrograms()),
			state: { utxos: [listed(TXID), listed("a".repeat(64))] },
		};

		expect(spent(await reviewed(request))).toEqual(["b", "a"]);
	});

	test("refuses where the state lists fewer outputs than the inputs spending them", async () => {
		expect((await refused(spending(twoPrograms()))).reject).toBe("no-utxo-to-spend");
	});

	test("prefers an output listed in the asset the input spends", async () => {
		const request = {
			...spending(),
			state: { utxos: [listed("a".repeat(64), "ff".repeat(32)), listed(TXID, POLICY_ASSET)] },
		};

		expect(spent(await reviewed(request))).toEqual(["b"]);
	});

	test("refuses an input whose asset is known only once hooks run, rather than spending any output", async () => {
		const manifest = p2pk.edited((document) => {
			const action = (document.actions as Record<string, Document>).Receive as Document;
			const inputs = action.inputs as Document[];

			inputs[0] = { ...inputs[0], asset: "params.held_asset" };
			action.on_pre_broadcast = { set: { "params.held_asset": "params.lbtc" } };
		}).manifest;
		const request = receive({ manifest, params: { lbtc: POLICY_ASSET, pubkey: PUBKEY } });

		expect((await refused(request)).reason).toContain("held_asset");
	});

	test("spends the output the instance file pins, without a state file", async () => {
		const request = receive({
			instance: { provided_inputs: { p2pk_in: { txid: "a".repeat(64), vout: 0 } } },
			state: undefined,
		});

		expect(spent(await reviewed(request))).toEqual(["a"]);
	});

	test("refuses two inputs pinned to one output", async () => {
		const pin = { txid: TXID, vout: 0 };
		const request = {
			...spending(twoPrograms()),
			instance: { provided_inputs: { p2pk_in: pin, p2pk_in_2: pin } },
		};
		expect((await refused(request)).reject).toBe("document-fault");
	});
});
