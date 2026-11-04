import { describe, expect, test } from "bun:test";

import { estimateFeeSats } from "../fee";
import { toShownConfirmation } from "../index";
import {
	ACCOUNT,
	DERIVED,
	type Document,
	editedAction,
	P2PK,
	payRequest,
	POLICY_ASSET,
	PUBKEY,
	receiveRequest,
	reviewed,
} from "./harness";

const receive = (manifest: Document = P2PK) => reviewed(receiveRequest({ manifest }));
const shown = async (manifest?: Document) => (await receive(manifest)).confirmation;

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
		const result = await receive();

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

	test("shows the balance change per asset, as the wallet's own finding", async () => {
		const model = await shown();

		expect(model.netEffect).toHaveLength(1);
		expect(model.netEffect[0]?.asset).toMatchObject({ origin: "computed", value: POLICY_ASSET });
		expect(model.netEffect[0]?.sats.origin).toBe("computed");
	});

	test("and that change is the covenant's holding back, less what the fee takes", async () => {
		const result = await receive();

		expect(result.confirmation.netEffect[0]?.sats.value).toBe(50_000n - result.estimatedFeeSats);
	});

	test("and reads as an outgoing figure when the action pays a covenant", async () => {
		const result = await reviewed(payRequest());

		expect(result.confirmation.netEffect[0]?.sats.value).toBe(-1000n - result.estimatedFeeSats);
	});

	test("marks a covenant it compared against the chain as checked", async () => {
		const [covenant] = (await shown()).covenants;

		expect(covenant?.verified).toMatchObject({ origin: "computed", value: true });
		expect(covenant?.address).toMatchObject({ origin: "verified", value: DERIVED });
	});

	test("and says so plainly about one it did not", async () => {
		const result = await reviewed(payRequest());

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

	test("the action's intent is the dapp's, with its references filled in", async () => {
		const manifest = editedAction("Receive", (action) => {
			action.intent = "spend to {params.pubkey:short}";
		});

		expect((await shown(manifest)).summary).toMatchObject({
			origin: "dapp",
			value: `spend to ${PUBKEY}`,
		});
	});

	test("and there is no summary where the action states no intent", async () => {
		expect((await shown()).summary).toBeUndefined();
	});

	test("and so is its word for what kind of output a covenant is", async () => {
		expect((await shown()).covenants[0]?.utxoType).toMatchObject({
			origin: "dapp",
			value: "p2pk_output",
		});
	});
});

function confidentialAt(at: number, confidential: boolean | undefined): Document {
	return editedAction("Receive", (action) => {
		const output = (action.outputs as Document[])[at]!;

		if (confidential === undefined) {
			delete output.confidential;
		} else {
			output.confidential = confidential;
		}
	});
}

const saying = (confidential: boolean | undefined) => confidentialAt(0, confidential);

describe("what a person is told about a blinded amount", () => {
	async function blinded(manifest: Document) {
		return (await shown(manifest)).blindedAmounts.map((row) => ({
			decidedBy: row.decidedBy.value,
			id: row.id.value,
		}));
	}

	test("when the protocol asked for it outright", async () => {
		expect(await blinded(saying(true))).toContainEqual({
			decidedBy: "this protocol asks for it to be blinded",
			id: "received_out",
		});
	});

	test("when nobody said anything and this network's own answer is to blind", async () => {
		expect(await blinded(saying(undefined))).toContainEqual({
			decidedBy: "nothing says otherwise and this network blinds an output by default",
			id: "received_out",
		});
	});

	test("and says nothing about an output the protocol leaves in the open", async () => {
		expect((await blinded(saying(false))).map((row) => row.id)).not.toContain("received_out");
	});

	test("the sentence is the wallet's and the name beside it is the dapp's", async () => {
		const [row] = (await shown(saying(true))).blindedAmounts;

		expect(row?.decidedBy.origin).toBe("computed");
		expect(row?.id.origin).toBe("dapp");
	});
});

function changeSaying(confidential: boolean | undefined | "absent"): Document {
	return confidential === "absent"
		? editedAction("Receive", (action) => {
				(action.outputs as Document[]).pop();
			})
		: confidentialAt(1, confidential);
}

describe("what a person is told about an amount this wallet published", () => {
	async function published(manifest: Document) {
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
					"nothing says otherwise and this network blinds an output by default, and this " +
					"wallet publishes it anyway so your next action can spend those funds",
			},
		]);
	});

	test("naming the protocol's own word when it asked for blinded change outright", async () => {
		expect(await published(changeSaying(true))).toEqual([
			{
				id: "change",
				reason:
					"this protocol asks for it to be blinded, and this wallet publishes it anyway so " +
					"your next action can spend those funds",
			},
		]);
	});

	test("and says it even where the document declares no change at all", async () => {
		expect(await published(changeSaying("absent"))).toEqual([
			{
				id: "change",
				reason:
					"nothing says otherwise and this network blinds an output by default, and this " +
					"wallet publishes it anyway so your next action can spend those funds",
			},
		]);
	});

	test("and no longer counts that change among the amounts it blinds", async () => {
		const model = await shown(changeSaying(undefined));

		expect(model.blindedAmounts.map((row) => row.id.value)).not.toContain("fee_change");
	});
});

describe("the model as it crosses to a surface", () => {
	test("writes every amount as a decimal string", async () => {
		const result = await receive();
		const crossed = toShownConfirmation(result.confirmation);

		expect(crossed.feeSats.value).toBe(result.estimatedFeeSats.toString());
		expect(crossed.netEffect[0]?.sats.value).toBe(
			result.confirmation.netEffect[0]?.sats.value.toString(),
		);
	});

	test("and survives the encoding the bus actually uses", async () => {
		const crossed = toShownConfirmation((await receive()).confirmation);

		expect(JSON.parse(JSON.stringify(crossed)).account.value).toBe(ACCOUNT);
	});

	test("keeping each value's origin, which is the whole reason it is carried", async () => {
		const crossed = toShownConfirmation((await receive()).confirmation);

		expect(crossed.feeSats.origin).toBe("computed");
		expect(crossed.netEffect[0]?.sats.origin).toBe("computed");
		expect(crossed.protocol.origin).toBe("dapp");
	});
});

describe("what the confirmation says a contract is", () => {
	test("carries the contract's own hashes beside the address its funds sit at", async () => {
		const result = await receive();

		expect(result.confirmation.covenants).not.toHaveLength(0);

		for (const row of result.confirmation.covenants) {
			expect(row.cmr.value).toHaveLength(64);
			expect(row.tapleafHash.value).toHaveLength(64);
			expect(row.cmr.value).not.toBe(row.tapleafHash.value);
			expect(row.cmr.value).not.toBe(row.address.value);
		}
	});

	test("and says both were worked out here rather than taken from the dapp", async () => {
		const result = await receive();

		for (const row of result.confirmation.covenants) {
			expect(row.cmr.origin).toBe("computed");
			expect(row.tapleafHash.origin).toBe("computed");
		}
	});
});
