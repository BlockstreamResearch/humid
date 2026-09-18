import { describe, expect, test } from "bun:test";

import { estimateFeeSats, estimateVsize } from "./fee";

describe("estimateVsize", () => {
	test("one wallet input and one output", () => {
		expect(
			estimateVsize({ covenantInputs: 0, issuingInputs: 0, outputs: 1, walletInputs: 1 }),
		).toBe(257n);
	});

	test("two wallet inputs and one output", () => {
		expect(
			estimateVsize({ covenantInputs: 0, issuingInputs: 0, outputs: 1, walletInputs: 2 }),
		).toBe(326n);
	});

	test("one wallet input and two outputs", () => {
		expect(
			estimateVsize({ covenantInputs: 0, issuingInputs: 0, outputs: 2, walletInputs: 1 }),
		).toBe(324n);
	});

	test("one wallet input, one covenant input and one output", () => {
		expect(
			estimateVsize({ covenantInputs: 1, issuingInputs: 0, outputs: 1, walletInputs: 1 }),
		).toBe(344n);
	});

	test("a second covenant input is estimated one vbyte high, deliberately", () => {
		expect(
			estimateVsize({ covenantInputs: 2, issuingInputs: 0, outputs: 1, walletInputs: 1 }),
		).toBe(431n);
	});

	test("an input that also creates an asset costs its own weight plus the issuance", () => {
		expect(
			estimateVsize({ covenantInputs: 0, issuingInputs: 1, outputs: 1, walletInputs: 1 }),
		).toBe(331n);
		expect(
			estimateVsize({ covenantInputs: 1, issuingInputs: 1, outputs: 1, walletInputs: 1 }),
		).toBe(418n);
	});
});

describe("estimateFeeSats", () => {
	const shape = { covenantInputs: 0, issuingInputs: 0, outputs: 1, walletInputs: 1 };

	test("at a rate of 1000 the fee is the vsize", () => {
		expect(estimateFeeSats(shape, 1000)).toBe(257n);
	});

	test("at a rate of 100 it is a tenth, rounded up", () => {
		expect(estimateFeeSats(shape, 100)).toBe(26n);
	});

	test("rounds up rather than down, so the transaction is never short", () => {
		expect(
			estimateFeeSats({ covenantInputs: 0, issuingInputs: 0, outputs: 1, walletInputs: 1 }, 1),
		).toBe(1n);
	});

	test("a fractional rate is taken at its ceiling", () => {
		expect(estimateFeeSats(shape, 100.1)).toBe(estimateFeeSats(shape, 101));
	});
});
