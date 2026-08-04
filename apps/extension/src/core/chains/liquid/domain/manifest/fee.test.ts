import { describe, expect, test } from "bun:test";

import { estimateFeeSats, estimateVsize } from "./fee";

// The shapes below reproduce the measurements taken against the real signing module in
// loadSmplxWasm.test.ts. If those move, these fail with them — which is the point: a fee
// model that drifts from what the module charges is worse than no model, because nothing
// downstream would notice.

describe("estimateVsize", () => {
	test("one wallet input and one output", () => {
		expect(estimateVsize({ covenantInputs: 0, outputs: 1, walletInputs: 1 })).toBe(257n);
	});

	test("two wallet inputs and one output", () => {
		expect(estimateVsize({ covenantInputs: 0, outputs: 1, walletInputs: 2 })).toBe(326n);
	});

	test("one wallet input and two outputs", () => {
		expect(estimateVsize({ covenantInputs: 0, outputs: 2, walletInputs: 1 })).toBe(324n);
	});

	test("one wallet input, one covenant input and one output", () => {
		expect(estimateVsize({ covenantInputs: 1, outputs: 1, walletInputs: 1 })).toBe(344n);
	});

	// The module charged 430 for this shape and the model says 431. It over-states rather
	// than under-states, which is the direction that returns the difference to the person as
	// change instead of taking it as a larger fee.
	test("a second covenant input is estimated one vbyte high, deliberately", () => {
		expect(estimateVsize({ covenantInputs: 2, outputs: 1, walletInputs: 1 })).toBe(431n);
	});
});

describe("estimateFeeSats", () => {
	const shape = { covenantInputs: 0, outputs: 1, walletInputs: 1 };

	test("at a rate of 1000 the fee is the vsize", () => {
		expect(estimateFeeSats(shape, 1000)).toBe(257n);
	});

	test("at a rate of 100 it is a tenth, rounded up", () => {
		expect(estimateFeeSats(shape, 100)).toBe(26n);
	});

	test("rounds up rather than down, so the transaction is never short", () => {
		expect(estimateFeeSats({ covenantInputs: 0, outputs: 1, walletInputs: 1 }, 1)).toBe(1n);
	});

	test("a fractional rate is taken at its ceiling", () => {
		expect(estimateFeeSats(shape, 100.1)).toBe(estimateFeeSats(shape, 101));
	});
});
