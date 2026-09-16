import { describe, expect, test } from "bun:test";

import { resolveBlinding } from "./blinding";

describe("the order the format resolves blinding in", () => {
	test("the output's own word comes first, over the document's", () => {
		expect(resolveBlinding({ declared: false, documentDefault: true })).toEqual({
			blinding: "open",
			decidedBy: "output",
		});
		expect(resolveBlinding({ declared: true, documentDefault: false })).toEqual({
			blinding: "hidden",
			decidedBy: "output",
		});
	});

	test("the document's word comes next, when the output says nothing", () => {
		expect(resolveBlinding({ documentDefault: false })).toEqual({
			blinding: "open",
			decidedBy: "document",
		});
	});

	test("and silence means hidden, because that is this network's own default", () => {
		expect(resolveBlinding({})).toEqual({ blinding: "hidden", decidedBy: "chain" });
	});

	test("a covenant output and an OP_RETURN are open whatever anything says", () => {
		expect(resolveBlinding({ declared: true, unblindable: "covenant" })).toEqual({
			blinding: "open",
			decidedBy: "unblindable",
		});
		expect(resolveBlinding({ documentDefault: true, unblindable: "data" })).toEqual({
			blinding: "open",
			decidedBy: "unblindable",
		});
	});
});

describe("what this wallet does with a contract action's own change", () => {
	test("publishes it, over the network's default that would have hidden it", () => {
		expect(resolveBlinding({ change: true })).toEqual({
			blinding: "open",
			decidedBy: "spendable-change",
			overrode: "chain",
		});
	});

	test("and over the document's own default, carrying that word instead", () => {
		expect(resolveBlinding({ change: true, documentDefault: true })).toEqual({
			blinding: "open",
			decidedBy: "spendable-change",
			overrode: "document",
		});
	});

	test("and over the protocol asking for it outright, carrying that word instead", () => {
		expect(resolveBlinding({ change: true, declared: true })).toEqual({
			blinding: "open",
			decidedBy: "spendable-change",
			overrode: "output",
		});
	});

	test("but overrides nothing when the protocol asked for open change itself", () => {
		expect(resolveBlinding({ change: true, declared: false })).toEqual({
			blinding: "open",
			decidedBy: "output",
		});
	});

	test("and reaches nothing that is not change", () => {
		expect(resolveBlinding({})).toEqual({ blinding: "hidden", decidedBy: "chain" });
		expect(resolveBlinding({ declared: true })).toEqual({
			blinding: "hidden",
			decidedBy: "output",
		});
	});
});
