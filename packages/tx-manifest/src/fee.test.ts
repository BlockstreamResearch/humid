import { describe, expect, test } from "bun:test";

import { estimateFeeSats, estimateVsize } from "./fee";

// What these pin is the model, and only the model. The figures it is built from were measured
// against the real signing module — a transaction of each shape built, signed and the fee it
// was charged at 1000 sat/kvb read back — and that measurement lives where signing does, which
// is not this slice: nothing here loads the module, and nothing here would notice if the
// module began charging something else.
//
// Pinning the arithmetic is still worth doing, because it is what makes a change to the model
// deliberate. Every constant is visible in one figure below, so a rule quietly edited fails
// here rather than moving every fee this wallet quotes. Checking the model against what the
// module actually charges belongs beside the signing it is checked by.

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

	// The module charged 430 for this shape and the model says 431. It over-states rather
	// than under-states, which is the direction that returns the difference to the person as
	// change instead of taking it as a larger fee.
	test("a second covenant input is estimated one vbyte high, deliberately", () => {
		expect(
			estimateVsize({ covenantInputs: 2, issuingInputs: 0, outputs: 1, walletInputs: 1 }),
		).toBe(431n);
	});

	// An issuance is a surcharge on an input that is already counted, so the same shape with
	// one of its inputs creating an asset is the plain figure plus the surcharge, and not an
	// input more. The surcharge was measured the same way as the rest, on the wallet shape; the
	// covenant figure below is that same surcharge added to a covenant input, which the source
	// states rather than measures, because the issuance fields belong to the input rather than
	// to its witness.
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
