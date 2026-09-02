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

	// The step that makes silence a decision. On Liquid an output nobody spoke about is hidden,
	// so a runtime that read the first two steps and stopped would build the opposite.
	test("and silence means hidden, because that is this network's own default", () => {
		expect(resolveBlinding({})).toEqual({ blinding: "hidden", decidedBy: "chain" });
	});

	// Before the precedence is consulted at all: a Simplicity program reads exact amounts
	// through jets that cannot introspect a commitment, and an OP_RETURN carries no value.
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

/**
 * The one deviation, and what it costs.
 *
 * A contract action can be funded only by outputs that hide nothing: unblinding one needs the
 * secrets that go with it, and the signing module is handed an outpoint and its bytes and
 * nothing more. So change returned hidden is money the next action cannot reach, and a sequence
 * of actions starves itself after the first.
 *
 * The wallet publishes it instead. That is against the format, which says silence about
 * confidentiality is itself a decision and that this network's decision is to hide, and the
 * change amount is on the chain as a result. The word that was set aside is carried out of here
 * so a person can be told which one it was.
 */
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

	// The case a person is owed the most: the protocol asked for this outright and the wallet
	// published it anyway, because honouring the request would have stranded their money.
	test("and over the protocol asking for it outright, carrying that word instead", () => {
		expect(resolveBlinding({ change: true, declared: true })).toEqual({
			blinding: "open",
			decidedBy: "spendable-change",
			overrode: "output",
		});
	});

	// Only where the format would have hidden. A protocol asking for open change is agreed
	// with, and nothing was overridden, so nothing claims to have been.
	test("but overrides nothing when the protocol asked for open change itself", () => {
		expect(resolveBlinding({ change: true, declared: false })).toEqual({
			blinding: "open",
			decidedBy: "output",
		});
	});

	// The deviation is exactly this wide. An output paid to the wallet is not change, however
	// much it looks like money coming back, and it is left hidden where the format hides it.
	test("and reaches nothing that is not change", () => {
		expect(resolveBlinding({})).toEqual({ blinding: "hidden", decidedBy: "chain" });
		expect(resolveBlinding({ declared: true })).toEqual({
			blinding: "hidden",
			decidedBy: "output",
		});
	});
});
