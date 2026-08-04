import { describe, expect, test } from "bun:test";

import { evaluateExpression } from "./evaluate";
import type { ReferenceScope } from "./references";

// The format defines no arithmetic. What real manifests were authored against is the
// reference implementation's behaviour, recorded in the change bundle's inventory: it
// expands pow(), substitutes references textually and hands the result to a third-party
// crate's signed 64-bit integer mode, checking only the final value for being negative.
// Where that behaviour is defined we match it; where it is inherited from a crate we do
// not use, we choose deliberately and the choice is asserted here rather than assumed.

const SCOPE: ReferenceScope = {
	fee: 500n,
	inputs: { will_in: { amount_sat: 100_000n } },
	instance: { SHARE: 3n },
	params: { amount_sat: 21_000n, decimals: 8n },
};

function value(text: string, scope: ReferenceScope = SCOPE): bigint | string {
	const result = evaluateExpression(text, "amount", scope);

	return result.ok ? result.value : result.reason;
}

describe("evaluateExpression", () => {
	describe("arithmetic", () => {
		test("a bare literal", () => {
			expect(value("42")).toBe(42n);
		});

		test("addition and subtraction, left to right", () => {
			expect(value("10 - 3 - 2")).toBe(5n);
		});

		test("multiplication binds tighter than addition", () => {
			expect(value("2 + 3 * 4")).toBe(14n);
		});

		test("parentheses override precedence", () => {
			expect(value("(2 + 3) * 4")).toBe(20n);
		});

		test("division truncates toward zero, as a 64-bit integer division does", () => {
			expect(value("7 / 2")).toBe(3n);
			expect(value("0 - 7 / 2")).toBe(-3n);
		});

		test("remainder takes the sign of the dividend", () => {
			expect(value("0 - 7 % 3")).toBe(-1n);
		});

		test("unary minus", () => {
			expect(value("-5 + 8")).toBe(3n);
		});

		test("pow expands, and its exponent may itself be a reference", () => {
			expect(value("pow(10, params.decimals)")).toBe(100_000_000n);
		});
	});

	describe("references resolve through the same sites as everything else", () => {
		test("a parameter", () => {
			expect(value("params.amount_sat")).toBe(21_000n);
		});

		test("an attribute of a resolved input, minus the wallet's fee", () => {
			expect(value("will_in.amount_sat - fee")).toBe(99_500n);
		});

		test("a deployment field", () => {
			expect(value("instance.SHARE * 2")).toBe(6n);
		});

		test("a decimal string resolves as the count it spells", () => {
			expect(value("total + 1", { params: { total: "9007199254740993" } })).toBe(
				9_007_199_254_740_994n,
			);
		});

		// A compile parameter decides a covenant address, and the fee comes from the
		// transaction that pays to that address, so the site refuses the term rather than
		// the evaluator refusing the arithmetic.
		test("the site still decides which forms are legal", () => {
			const result = evaluateExpression("fee + 1", "compileParam", SCOPE);

			expect(result.ok).toBe(false);
		});
	});

	// Intermediate negatives are legal because the reference only checks the final value.
	describe("signed intermediates", () => {
		test("an intermediate may go negative and come back", () => {
			expect(value("params.amount_sat - 30000 + 10000")).toBe(1_000n);
		});

		test("a negative result is returned rather than refused, because the caller decides", () => {
			expect(value("10 - 20")).toBe(-10n);
		});
	});

	// The reference inherits these from a Rust crate we do not use. Matching a crate is
	// not automatic, so the behaviour is chosen: anything that would leave the 64-bit
	// range is an error, never a wrap, because an amount that wraps silently changes what
	// is paid.
	describe("what we chose rather than inherited", () => {
		test("overflow past the 64-bit range is an error, not a wrap", () => {
			expect(value("9223372036854775807 + 1")).toContain("64-bit");
		});

		test("an intermediate outside the range is an error even when the result would fit", () => {
			expect(value("9223372036854775807 * 2 / 2")).toContain("64-bit");
		});

		test("division by zero is an error", () => {
			expect(value("10 / 0")).toContain("zero");
		});

		test("remainder by zero is an error", () => {
			expect(value("10 % 0")).toContain("zero");
		});

		test("a negative exponent is an error rather than a silent no-op", () => {
			expect(value("pow(2, 0 - 1)")).toContain("negative");
		});
	});

	describe("what it refuses", () => {
		test("an unresolvable term, naming it", () => {
			expect(value("nowhere + 1")).toContain("nowhere");
		});

		test("a malformed expression, rather than evaluating part of it", () => {
			expect(value("1 +")).toContain("1 +");
		});

		test("an unbalanced parenthesis", () => {
			expect(value("(1 + 2")).toContain("(1 + 2");
		});

		test("an operator this runtime does not define", () => {
			expect(value("1 & 2")).toContain("1 & 2");
		});

		test("a function that is not pow", () => {
			expect(value("min(1, 2)")).toContain("min");
		});

		test("a term that resolves to something that is not a number", () => {
			expect(value("owner + 1", { params: { owner: "0xdeadbeef" } })).toContain("owner");
		});
	});
});
