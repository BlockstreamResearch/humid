import { describe, expect, test } from "bun:test";

import type { RejectToken } from "../document/refuse";
import {
	COVENANT_TXOUT,
	DERIVED_SCRIPT,
	type Document,
	edited,
	editedAction,
	P2PK,
	payRequest,
	POLICY_ASSET,
	receiveRequest,
	refused,
	reviewed,
} from "./harness";

const payRefusal = async (edit: (pay: Document) => void) =>
	refused(payRequest({ manifest: editedAction("Pay", edit) }));

describe("what the document alone is refused for", () => {
	test("a protocol for a chain this wallet does not build on", async () => {
		const manifest = edited(P2PK, (copy) => {
			copy.chain = "bitcoin";
		});

		expect((await refused(payRequest({ manifest }))).reject).toBe("foreign-chain");
	});

	test("a construct the format defines and this wallet does not implement", async () => {
		const refusal = await payRefusal((pay) => {
			pay.allow_change = "any";
		});

		expect(refusal.reject).toBe("unimplemented-construct");
		expect(refusal.reason).toContain("allow_change");
	});

	test("a key the format does not define", async () => {
		const refusal = await payRefusal((pay) => {
			pay.sacrifice_to = "the sea";
		});

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("sacrifice_to");
	});

	test("but not a comment, which decides nothing", async () => {
		const manifest = editedAction("Pay", (pay) => {
			pay.$comment = "written by a person";
		});

		await reviewed(payRequest({ manifest }));
	});

	test("a build mode that is neither on nor off", async () => {
		const manifest = edited(P2PK, (copy) => {
			copy.simplicity_hl = { debug_symbols: "maybe" };
		});

		expect((await refused(payRequest({ manifest }))).reject).toBe("unreadable-build-mode");
	});

	test("a compiler other than the one this wallet ships", async () => {
		const refusal = await refused(payRequest(), { compilerVersion: "0.7.1" });

		expect(refusal.reject).toBe("foreign-compiler");
	});

	test("a witness this wallet cannot produce", async () => {
		const manifest = editedAction("Receive", (receive) => {
			const inputs = receive.inputs as Document[];
			const witnesses = inputs[0]?.witnesses as Record<string, Document>;

			(witnesses.SIGNATURE ?? {}).type = "PedersenProof";
		});

		expect((await refused(receiveRequest({ manifest }))).reject).toBe("unproducible-witness");
	});

	test("an asset the wallet could not establish", async () => {
		const refusal = await payRefusal((pay) => {
			((pay.outputs as Document[])[0] ?? {}).asset = "params.nobody_supplied_this";
		});

		expect(refusal.reject).toBe("foreign-asset");
	});
});

describe("a fee rate", () => {
	for (const [what, rate] of [
		["that is not a number", Number.NaN],
		["with no upper bound", Number.POSITIVE_INFINITY],
		["below zero", -1],
	] as const) {
		test(`${what} is refused`, async () => {
			const refusal = await refused(payRequest(), { readFeeRate: async () => rate });

			expect(refusal.reject).toBe("no-fee-rate");
			expect(refusal.reason).toContain(String(rate));
		});
	}

	test("of zero is a rate, and is built at", async () => {
		expect((await reviewed(payRequest(), { readFeeRate: async () => 0 })).feeRateSatsPerKvb).toBe(
			0,
		);
	});
});

describe("a declaration this runtime cannot read is refused, never passed over", () => {
	const cases: {
		edit: (pay: Document) => void;
		reject: RejectToken;
		says?: string;
		what: string;
	}[] = [
		{
			edit: (pay) => {
				(pay.inputs as unknown[])[0] = "funding_input";
			},
			reject: "document-fault",
			what: "an input that is not a declaration at all",
		},
		{
			edit: (pay) => {
				pay.params = ["pubkey", "amount_sat"];
			},
			reject: "document-fault",
			what: "parameters written as a list, which would fill none of them",
		},
		{
			edit: (pay) => {
				((pay.inputs as Document[])[0] ?? {}).witnesses = ["SIGNATURE"];
			},
			reject: "document-fault",
			what: "a witness block nothing can read, which the witness check would see none of",
		},
		{
			edit: (pay) => {
				((pay.inputs as Document[])[0] ?? {}).issuance = "new";
			},
			reject: "document-fault",
			what: "an issuance nothing can read, which would create no asset and say nothing",
		},
		{
			edit: (pay) => {
				pay.on_pre_broadcast = "params.locked = 1";
			},
			reject: "document-fault",
			what: "a hook that is not a block of assignments",
		},
		{
			edit: (pay) => {
				pay.on_pre_broadcast = { set: "params.locked = 1" };
			},
			reject: "document-fault",
			what: "a hook whose assignments are not a list of them",
		},
		{
			edit: (pay) => {
				((pay.inputs as Document[])[0] ?? {}).on_resolved = { sets: {} };
			},
			reject: "document-fault",
			what: "an input hook declaring nothing to set",
		},
		{
			edit: (pay) => {
				((pay.inputs as Document[])[0] ?? {}).required_index = 1.5;
			},
			reject: "unbuildable-position",
			says: "not a place in a transaction",
			what: "an input position that is not a place a transaction has",
		},
		{
			edit: (pay) => {
				((pay.outputs as Document[])[0] ?? {}).required_index = "first";
			},
			reject: "unbuildable-position",
			says: "not a place in a transaction",
			what: "an output position written as a word",
		},
		{
			edit: (pay) => {
				const outputs = pay.outputs as Document[];

				delete (outputs[0] ?? {}).id;
				(outputs[0] ?? {}).required_index = 0;
			},
			reject: "unbuildable-position",
			says: "gives no id",
			what: "a positioned output the manifest gives no id, which nothing could be checked against",
		},
		{
			edit: (pay) => {
				((pay.inputs as Document[])[0] ?? {}).sequence = 1.5;
			},
			reject: "document-fault",
			what: "a sequence that is not a whole number",
		},
		{
			edit: (pay) => {
				((pay.inputs as Document[])[0] ?? {}).sequence = 4_294_967_296;
			},
			reject: "document-fault",
			what: "a sequence wider than the four bytes that hold one",
		},
		{
			edit: (pay) => {
				((pay.inputs as Document[])[0] ?? {}).sequence = {
					relative_blocks: Number.NaN,
				};
			},
			reject: "document-fault",
			what: "a relative timelock of no number of blocks",
		},
		{
			edit: (pay) => {
				((pay.inputs as Document[])[0] ?? {}).sequence = {
					relative_blocks: Number.POSITIVE_INFINITY,
				};
			},
			reject: "document-fault",
			what: "a relative timelock with no end",
		},
		{
			edit: (pay) => {
				((pay.inputs as Document[])[0] ?? {}).sequence = { relative_blocks: 2.5 };
			},
			reject: "document-fault",
			what: "a relative timelock of part of a block",
		},
	];

	for (const { edit, reject, says, what } of cases) {
		test(what, async () => {
			const refusal = await payRefusal(edit);

			expect(refusal.reject).toBe(reject);

			if (says !== undefined) {
				expect(refusal.reason).toContain(says);
			}
		});
	}
});

describe("what the chain reader says an output holds", () => {
	for (const amountSats of [
		"",
		"0x2710",
		"1.5",
		"-5",
		" 10",
		"010",
		"1e4",
		"99999999999999999999999999",
	]) {
		test(`${JSON.stringify(amountSats)} is refused rather than converted`, async () => {
			const refusal = await refused(receiveRequest(), {
				readTxOut: async () => ({
					amountSats,
					rawAssetId: POLICY_ASSET,
					scriptPubKeyHex: DERIVED_SCRIPT,
					txOutHex: COVENANT_TXOUT,
				}),
			});

			expect(refusal.reject).toBe("unbuildable-utxo-type");
			expect(refusal.reason).toContain("not an amount this wallet can read");
		});
	}
});
