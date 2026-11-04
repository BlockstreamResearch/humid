import { describe, expect, test } from "bun:test";

import { resolveBlinding } from "./blinding";

describe("an output's blinding", () => {
	test("follows the output's own word", () => {
		expect(resolveBlinding({ declared: false })).toEqual({ blinding: "open", decidedBy: "output" });
		expect(resolveBlinding({ declared: true })).toEqual({
			blinding: "blinded",
			decidedBy: "output",
		});
	});

	test("defaults to blinded, as the network does", () => {
		expect(resolveBlinding({})).toEqual({ blinding: "blinded", decidedBy: "chain" });
	});

	test("is open for a covenant or an OP_RETURN whatever the output says", () => {
		expect(resolveBlinding({ declared: true, unblindable: "covenant" })).toEqual({
			blinding: "open",
			decidedBy: "unblindable",
		});
	});
});

describe("a contract action's change", () => {
	test("is published, recording what would have blinded the output", () => {
		expect(resolveBlinding({ change: true })).toEqual({
			blinding: "open",
			decidedBy: "spendable-change",
			overrode: "chain",
		});
		expect(resolveBlinding({ change: true, declared: true })).toEqual({
			blinding: "open",
			decidedBy: "spendable-change",
			overrode: "output",
		});
	});

	test("overrides nothing where the protocol asked for open change", () => {
		expect(resolveBlinding({ change: true, declared: false })).toEqual({
			blinding: "open",
			decidedBy: "output",
		});
	});
});
