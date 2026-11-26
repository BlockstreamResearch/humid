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

	test("is open for a program or an OP_RETURN whatever the output says", () => {
		expect(resolveBlinding({ declared: true, unblindable: "program" })).toEqual({
			blinding: "open",
			decidedBy: "unblindable",
		});
	});
});

describe("a contract action's change", () => {
	test("is published where nothing sets its blinding", () => {
		expect(resolveBlinding({ change: true })).toEqual({
			blinding: "open",
			decidedBy: "spendable-change",
		});
	});

	test("follows the protocol's word either way", () => {
		expect(resolveBlinding({ change: true, declared: true })).toEqual({
			blinding: "blinded",
			decidedBy: "output",
		});
		expect(resolveBlinding({ change: true, declared: false })).toEqual({
			blinding: "open",
			decidedBy: "output",
		});
	});
});
