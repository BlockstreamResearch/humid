import { describe, expect, test } from "bun:test";

import type { RejectToken } from "../refusal";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import {
	PROGRAM_TXOUT,
	DERIVED_SCRIPT,
	type Document,
	Fixture,
	POLICY_ASSET,
	PUBKEY,
	refused,
	reviewed,
	TXID,
} from "./reviewForTests";

const p2pk = Fixture.load("p2pk");

const pay = (overrides: Partial<ParsedLiquidProcessCtParams> = {}) =>
	p2pk.request("Pay", { params: { amount_sat: 1000, pubkey: PUBKEY }, ...overrides });

const receive = (overrides: Partial<ParsedLiquidProcessCtParams> = {}) =>
	p2pk.request("Receive", {
		params: { pubkey: PUBKEY },
		state: { utxos: [{ txid: TXID, utxo_type: "p2pk_output", vout: 0 }] },
		...overrides,
	});

const payRefusal = async (edit: (pay: Document) => void) =>
	refused(pay({ manifest: p2pk.editedAction("Pay", edit).manifest }));

describe("what the document alone is refused for", () => {
	test("a protocol for a chain this wallet does not build on", async () => {
		const manifest = p2pk.edited((copy) => {
			copy.chain = "bitcoin";
		}).manifest;

		expect((await refused(pay({ manifest }))).reject).toBe("foreign-chain");
	});

	test("a construct the format defines and this wallet does not implement", async () => {
		const refusal = await payRefusal((action) => {
			action.on_post_broadcast = { set: {} };
		});

		expect(refusal.reject).toBe("unimplemented-construct");
		expect(refusal.reason).toContain("on_post_broadcast");
	});

	test("a key the format does not define", async () => {
		const refusal = await payRefusal((action) => {
			action.sacrifice_to = "the sea";
		});

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("sacrifice_to");
	});

	test("but not a comment, which decides nothing", async () => {
		const manifest = p2pk.editedAction("Pay", (action) => {
			action.$comment = "written by a person";
		}).manifest;

		await reviewed(pay({ manifest }));
	});

	test("a build mode that is neither on nor off", async () => {
		const manifest = p2pk.edited((copy) => {
			copy.simplicity_hl = { debug_symbols: "maybe" };
		}).manifest;

		expect((await refused(pay({ manifest }))).reject).toBe("unreadable-build-mode");
	});

	test("a compiler other than the one this wallet ships", async () => {
		const refusal = await refused(pay(), { compilerVersion: "0.7.1" });

		expect(refusal.reject).toBe("foreign-compiler");
	});

	test("a witness this wallet cannot produce", async () => {
		const manifest = p2pk.editedAction("Receive", (action) => {
			const inputs = action.inputs as Document[];
			const witnesses = inputs[0]?.witnesses as Record<string, Document>;

			(witnesses.SIGNATURE ?? {}).type = "PedersenProof";
		}).manifest;

		expect((await refused(receive({ manifest }))).reject).toBe("unproducible-witness");
	});

	test("an input whose id is a namespace a reference reads", async () => {
		const refusal = await payRefusal((action) => {
			((action.inputs as Document[])[0] ?? {}).id = "params";
		});

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain('"params"');
	});

	test("a parameter computed in a way this wallet does not implement, rather than left at its default", async () => {
		const refusal = await payRefusal((action) => {
			(action.params as Record<string, Document>).pubkey = {
				compute: { address: "params.receiver", type: "script_hash" },
				type: "pubkey",
			};
		});

		expect(refusal.reject).toBe("unimplemented-construct");
	});

	test("a computed field whose contract is not the one its hash pins", async () => {
		const lending = Fixture.load("lending_v3");
		const manifest = lending.edited((copy) => {
			const templates = copy.contract_templates as {
				lending_contract: {
					actions: { CreateOffer: { create_instance: { fields: Record<string, Document> } } };
				};
			};
			const fields = templates.lending_contract.actions.CreateOffer.create_instance.fields;

			(fields.LENDER_VAULT_COV_HASH ?? {}).simf_hash = `sha256:${"00".repeat(32)}`;
		}).manifest;
		const refusal = await refused(lending.request("CreateOffer", { manifest }));

		expect(refusal.reject).toBe("source-mismatch");
		expect(refusal.reason).toContain("CreateOffer / LENDER_VAULT_COV_HASH");
	});

	test("an asset the wallet could not establish", async () => {
		const refusal = await payRefusal((action) => {
			((action.outputs as Document[])[0] ?? {}).asset = "params.nobody_supplied_this";
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
			const refusal = await refused(pay(), { readFeeRate: async () => rate });

			expect(refusal.reject).toBe("no-fee-rate");
			expect(refusal.reason).toContain(String(rate));
		});
	}

	test("of zero is a rate, and is built at", async () => {
		expect((await reviewed(pay(), { readFeeRate: async () => 0 })).feeRateSatsPerKvb).toBe(0);
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
			edit: (action) => {
				(action.inputs as unknown[])[0] = "funding_input";
			},
			reject: "document-fault",
			what: "an input that is not a declaration at all",
		},
		{
			edit: (action) => {
				action.params = ["pubkey", "amount_sat"];
			},
			reject: "document-fault",
			what: "parameters written as a list, which would fill none of them",
		},
		{
			edit: (action) => {
				((action.inputs as Document[])[0] ?? {}).witnesses = ["SIGNATURE"];
			},
			reject: "document-fault",
			what: "a witness block nothing can read, which the witness check would see none of",
		},
		{
			edit: (action) => {
				((action.inputs as Document[])[0] ?? {}).issuance = "new";
			},
			reject: "document-fault",
			what: "an issuance nothing can read, which would create no asset and say nothing",
		},
		{
			edit: (action) => {
				action.on_pre_broadcast = "params.locked = 1";
			},
			reject: "document-fault",
			what: "a hook that is not a block of assignments",
		},
		{
			edit: (action) => {
				action.on_pre_broadcast = { set: "params.locked = 1" };
			},
			reject: "document-fault",
			what: "a hook whose assignments are not a list of them",
		},
		{
			edit: (action) => {
				((action.inputs as Document[])[0] ?? {}).on_resolved = { sets: {} };
			},
			reject: "document-fault",
			what: "an input hook declaring nothing to set",
		},
		{
			edit: (action) => {
				((action.inputs as Document[])[0] ?? {}).required_index = 1.5;
			},
			reject: "unbuildable-position",
			says: "not a place in a transaction",
			what: "an input position that is not a place a transaction has",
		},
		{
			edit: (action) => {
				((action.outputs as Document[])[0] ?? {}).required_index = "first";
			},
			reject: "unbuildable-position",
			says: "not a place in a transaction",
			what: "an output position written as a word",
		},
		{
			edit: (action) => {
				const outputs = action.outputs as Document[];

				delete (outputs[0] ?? {}).id;
				(outputs[0] ?? {}).required_index = 0;
			},
			reject: "unbuildable-position",
			says: "gives no id",
			what: "a positioned output the manifest gives no id, which nothing could be checked against",
		},
		{
			edit: (action) => {
				((action.inputs as Document[])[0] ?? {}).sequence = 1.5;
			},
			reject: "document-fault",
			what: "a sequence that is not a whole number",
		},
		{
			edit: (action) => {
				((action.inputs as Document[])[0] ?? {}).sequence = 4_294_967_296;
			},
			reject: "document-fault",
			what: "a sequence wider than the four bytes that hold one",
		},
		{
			edit: (action) => {
				((action.inputs as Document[])[0] ?? {}).sequence = {
					relative_blocks: Number.NaN,
				};
			},
			reject: "document-fault",
			what: "a relative timelock of no number of blocks",
		},
		{
			edit: (action) => {
				((action.inputs as Document[])[0] ?? {}).sequence = {
					relative_blocks: Number.POSITIVE_INFINITY,
				};
			},
			reject: "document-fault",
			what: "a relative timelock with no end",
		},
		{
			edit: (action) => {
				((action.inputs as Document[])[0] ?? {}).sequence = { relative_blocks: 2.5 };
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
			const refusal = await refused(receive(), {
				readTxOut: async () => ({
					amountSats,
					rawAssetId: POLICY_ASSET,
					scriptPubKeyHex: DERIVED_SCRIPT,
					txOutHex: PROGRAM_TXOUT,
				}),
			});

			expect(refusal.reject).toBe("unbuildable-utxo-type");
			expect(refusal.reason).toContain("not an amount this wallet can read");
		});
	}
});
