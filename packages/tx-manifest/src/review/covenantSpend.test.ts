import { describe, expect, test } from "bun:test";

import {
	actionOf,
	COVENANT_TXOUT,
	type Document,
	editedAction,
	FUNDING_TXID,
	P2PK,
	P2PK_SOURCE,
	payRequest,
	POLICY_ASSET,
	PUBKEY,
	receiveRequest,
	refused,
	reviewed,
	TXID,
} from "./harness";

const receiveInputs = () => structuredClone(actionOf(P2PK, "Receive").inputs) as Document[];

function withReceive(inputs: unknown[], outputs?: unknown[]): Document {
	return editedAction("Receive", (action) => {
		action.inputs = inputs;

		if (outputs !== undefined) {
			action.outputs = outputs;
		}
	});
}

const spending = (manifest: Document = P2PK) => receiveRequest({ manifest });

describe("what the review carries out about a covenant it will spend", () => {
	test("carries the exact source, arguments, leaves and mode it checked against the chain", async () => {
		const review = await reviewed(spending());

		expect(review.covenantInputs).toEqual([
			{
				argumentsJson: JSON.stringify({ PUB_KEY: { type: "Pubkey", value: `0x${PUBKEY}` } }),
				extraLeavesJson: "[]",
				id: "p2pk_in",
				includeDebugSymbols: false,
				signatureWitness: "SIGNATURE",
				source: P2PK_SOURCE,
				txOutHex: COVENANT_TXOUT,
				txid: TXID,
				utxoType: "p2pk_output",
				vout: 0,
			},
		]);
	});

	test("names the witness a signature must fill, from the document's own declaration", async () => {
		expect((await reviewed(spending())).covenantInputs[0]?.signatureWitness).toBe("SIGNATURE");
	});

	test("names no signature witness where the document declares none", async () => {
		const inputs = receiveInputs();
		const covenantInput = inputs[0];

		delete covenantInput?.witnesses;

		const review = await reviewed(spending(withReceive(inputs)));

		expect(review.covenantInputs[0]?.signatureWitness).toBeUndefined();
	});

	test("carries a stated witness value through without reading the value", async () => {
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

		const review = await reviewed(spending(withReceive(inputs)));

		expect(review.covenantInputs[0]?.witnessValues).toEqual([
			{ name: "BRANCH", simplicityType: "Either<(), ()>", value: "Left(())" },
		]);
	});
});

describe("the order the transaction's inputs are built in", () => {
	test("is the order the action declares them, covenant and wallet alike", async () => {
		const review = await reviewed(spending());

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

		const review = await reviewed(spending(withReceive(inputs)));

		expect(review.inputOrder.map((planned) => planned.source)).toEqual(["wallet", "covenant"]);
	});

	test("reports the wallet's own outputs separately from the order", async () => {
		const review = await reviewed(spending());

		expect(review.selected).toHaveLength(1);
		expect(review.selected[0]?.txid).toBe(FUNDING_TXID);
		expect(review.inputOrder).toHaveLength(2);
	});
});

describe("the transaction-level facts a covenant spend needs", () => {
	test("declares the chain's height as a locktime when a covenant is spent", async () => {
		const review = await reviewed(spending(), { readChainTip: async () => 3_210_987 });

		expect(review.locktimeHeight).toBe(3_210_987);
	});

	test("declares none for an action that spends no covenant", async () => {
		const review = await reviewed(payRequest(), { readChainTip: async () => 3_210_987 });

		expect(review.locktimeHeight).toBeUndefined();
	});

	test("builds without one rather than refusing when the tip cannot be read", async () => {
		const review = await reviewed(spending(), {
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

		const review = await reviewed(spending(withReceive(inputs)));

		expect(review.sequence).toBe(4_294_967_294);
	});

	test("carries none where the action declares none", async () => {
		expect((await reviewed(spending())).sequence).toBeUndefined();
	});

	test("carries a relative timelock where the covenant input is the only input", async () => {
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
		const review = await reviewed(spending(withReceive([inputs[0]], outputs)));

		expect(review.sequence).toBe(10);
		expect(review.selected).toHaveLength(0);
		expect(review.inputOrder).toHaveLength(1);
	});

	test("refuses a relative timelock a wallet fee input would inherit", async () => {
		const inputs = receiveInputs();

		inputs[0] = { ...inputs[0], sequence: { relative_blocks: 10 } };

		const refusal = await refused(spending(withReceive(inputs)));

		expect(refusal.reject).toBe("unimplemented-construct");
		expect(refusal.reason).toContain("would inherit that wait");
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

	test("appears in the order as the covenant, at the covenant's outpoint", async () => {
		const review = await reviewed(spending(issuingDocument()));
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
		const review = await reviewed(spending(issuingDocument()));
		const minted = review.outputs.find((output) => output.id === "minted_out");

		expect(minted?.asset).toBe(review.issuances[0]?.asset);
		expect(minted?.sats).toBe(1000n);
	});
});

describe("an action whose only output is change", () => {
	const changeOut = {
		asset: "lbtc",
		description: "Everything the covenant held, back to your wallet.",
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

	test("leaves the change to the builder", async () => {
		const review = await reviewed(spending(withReceive(receiveInputs(), [changeOut])));

		expect(review.outputs).toEqual([]);
		expect(review.changeDeferred).toBe(true);
	});

	test("defers nothing where the action declares no change", async () => {
		const review = await reviewed(spending(withReceive(receiveInputs(), [receivedOut])));

		expect(review.outputs.map((output) => output.id)).toEqual(["received_out"]);
		expect(review.changeDeferred).toBeUndefined();
	});
});

describe("which covenant output each input spends", () => {
	const twoCovenants = () => {
		const inputs = receiveInputs();

		return withReceive([inputs[0], { ...inputs[0], id: "p2pk_in_2" }, inputs[1]]);
	};
	const listed = (txid: string, asset?: string) => ({
		txid,
		utxo_type: "p2pk_output",
		vout: 0,
		...(asset === undefined ? {} : { asset }),
	});
	const spent = (review: Awaited<ReturnType<typeof reviewed>>) =>
		review.covenantInputs.map((covenant) => covenant.txid[0]);

	test("gives two inputs of one type two different outputs", async () => {
		const request = {
			...spending(twoCovenants()),
			state: { utxos: [listed(TXID), listed("a".repeat(64))] },
		};

		expect(spent(await reviewed(request))).toEqual(["b", "a"]);
	});

	test("refuses where the state lists fewer outputs than the inputs spending them", async () => {
		expect((await refused(spending(twoCovenants()))).reject).toBe("no-utxo-to-spend");
	});

	test("prefers an output listed in the asset the input spends", async () => {
		const request = {
			...spending(),
			state: { utxos: [listed("a".repeat(64), "ff".repeat(32)), listed(TXID, POLICY_ASSET)] },
		};

		expect(spent(await reviewed(request))).toEqual(["b"]);
	});

	test("spends the output the instance file pins, without a state file", async () => {
		const request = receiveRequest({
			instance: { provided_inputs: { p2pk_in: { txid: "a".repeat(64), vout: 0 } } },
			state: undefined,
		});

		expect(spent(await reviewed(request))).toEqual(["a"]);
	});

	test("refuses two inputs pinned to one output", async () => {
		const pin = { txid: TXID, vout: 0 };
		const request = {
			...spending(twoCovenants()),
			instance: { provided_inputs: { p2pk_in: pin, p2pk_in_2: pin } },
		};
		expect((await refused(request)).reject).toBe("document-fault");
	});
});
