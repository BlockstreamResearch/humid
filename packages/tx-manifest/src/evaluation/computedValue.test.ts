import { describe, expect, test } from "bun:test";

import { computedValue, computesValue } from "./computedValue";

// The whole of this file is about one distinction: a value the document computes against a
// value the document states. Several positions in the format accept both in the same slot, and
// the corpus writes both, so reading one as the other is not a type error anywhere — it is a
// different number in a transaction.

describe("what counts as a value the document computes", () => {
	test("arithmetic does", () => {
		expect(computesValue("params.A + 1")).toBe(true);
		expect(computesValue("A * B / 10000")).toBe(true);
		expect(computesValue("pow(2, 8)")).toBe(true);
		expect(computesValue("-1")).toBe(true);
	});

	test("a reference does not", () => {
		expect(computesValue("$params.PRINCIPAL_AMOUNT")).toBe(false);
		expect(computesValue("instance.CURRENT_DEBT")).toBe(false);
		expect(computesValue("BORROWER_NFT_ASSET_ID")).toBe(false);
	});

	// The two literals the corpus writes at a deployment's fields, and the reason the question
	// is asked by looking for operators rather than by trying to evaluate. Both of these are
	// legal arithmetic: read as a formula the first is unchanged and the second becomes "0",
	// which is a different value at every position that encodes it and an error at none.
	test("a literal does not, including the ones that evaluate to something else", () => {
		expect(computesValue("2")).toBe(false);
		expect(computesValue("0".repeat(64))).toBe(false);
		expect(computedValue("0".repeat(64), "compileParam", { params: {} })).toEqual({
			ok: true,
			value: "0",
		});
	});
});

describe("what a computed value comes to", () => {
	test("is the number, as the string every position records a value as", () => {
		expect(computedValue("params.A * 3", "compileParam", { params: { A: "14" } })).toEqual({
			ok: true,
			value: "42",
		});
	});

	// The position decides what a term may name, and a computed value is not a way round that.
	// The fee is refused here because a value at this position decides a covenant's address and
	// the fee comes from the transaction that pays to it.
	test("refuses a term the position does not admit, as a position error", () => {
		const found = computedValue("fee + 1", "compileParam", { fee: 100n, params: {} });

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("cannot be used as a compile parameter");
	});

	test("refuses arithmetic that leaves the range these numbers are held in", () => {
		const found = computedValue("pow(2, 62) * 4", "compileParam", { params: {} });

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("64-bit range");
	});
});
