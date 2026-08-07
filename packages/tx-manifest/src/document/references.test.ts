import { describe, expect, test } from "bun:test";

import { parseReference, type ReferenceScope, resolveReference } from "./references";

// The forms and their order come from the reference implementation's own resolver, as
// recorded in the change bundle's construct inventory: fee, then instance. (with
// compile_params. as a deprecated alias), params., args., a bare unprefixed name tried as
// param then arg, then input_id.amount_sat / .asset and other per-input attributes.

const SCOPE: ReferenceScope = {
	args: { note: "from args" },
	fee: 500n,
	inputs: { p2pk_in: { amount_sat: 21_000n, asset: "lbtc" } },
	instance: { OWNER: "0x01", shared: "from instance" },
	params: { pubkey: "0x02", shared: "from params" },
};

describe("parseReference", () => {
	test("reads a namespaced reference", () => {
		expect(parseReference("params.pubkey")).toMatchObject({ form: "params", name: "pubkey" });
	});

	test("accepts the $-prefixed spelling of the same reference", () => {
		expect(parseReference("$params.pubkey")).toMatchObject({ form: "params", name: "pubkey" });
	});

	test("reads compile_params. as the deprecated spelling of instance.", () => {
		expect(parseReference("compile_params.OWNER")).toMatchObject({
			deprecated: true,
			form: "instance",
			name: "OWNER",
		});
	});

	test("reads the reserved fee keyword", () => {
		expect(parseReference("fee")).toMatchObject({ form: "fee" });
	});

	test("reads a bare unprefixed name", () => {
		expect(parseReference("pubkey")).toMatchObject({ form: "bare", name: "pubkey" });
	});

	test("reads an attribute of a named input", () => {
		expect(parseReference("p2pk_in.amount_sat")).toMatchObject({
			attribute: "amount_sat",
			form: "input-attribute",
			name: "p2pk_in",
		});
	});

	test("is not an expression parser", () => {
		expect(parseReference("params.amount_sat > 0")).toBeUndefined();
		expect(parseReference("a + b")).toBeUndefined();
	});
});

describe("resolveReference", () => {
	describe("a site decides which forms it accepts", () => {
		test("a compile parameter may come from the request's parameters", () => {
			expect(resolveReference("params.pubkey", "compileParam", SCOPE)).toEqual({
				form: "params",
				ok: true,
				value: "0x02",
			});
		});

		// A covenant address cannot depend on the fee: the fee depends on the transaction,
		// which depends on the address. The site is what makes that unrepresentable rather
		// than a mistake caught later.
		test("a compile parameter may not come from the fee", () => {
			const result = resolveReference("fee", "compileParam", SCOPE);

			expect(result.ok).toBe(false);
		});

		test("an output amount may come from the fee", () => {
			expect(resolveReference("fee", "amount", SCOPE)).toEqual({
				form: "fee",
				ok: true,
				value: 500n,
			});
		});

		test("an output amount may come from what an input holds", () => {
			expect(resolveReference("p2pk_in.amount_sat", "amount", SCOPE)).toEqual({
				form: "input-attribute",
				ok: true,
				value: 21_000n,
			});
		});

		test("a compile parameter may not come from what an input holds", () => {
			expect(resolveReference("p2pk_in.amount_sat", "compileParam", SCOPE).ok).toBe(false);
		});

		test("a destination names a parameter and nothing else", () => {
			expect(resolveReference("params.pubkey", "destination", SCOPE).ok).toBe(true);
			expect(resolveReference("fee", "destination", SCOPE).ok).toBe(false);
			expect(resolveReference("pubkey", "destination", SCOPE).ok).toBe(false);
		});

		test("says which site refused it, so a refusal can be read", () => {
			const result = resolveReference("fee", "compileParam", SCOPE);

			expect(result.ok ? "" : result.reason).toContain("fee");
		});
	});

	// AC-10, reference-namespace half: the two namespaces and the two prefix spellings are
	// four ways of writing one thing, and they produce one result.
	describe("equivalent spellings produce identical results", () => {
		test("instance. and compile_params. resolve the same value by the same form", () => {
			const current = resolveReference("instance.OWNER", "compileParam", SCOPE);
			const deprecated = resolveReference("compile_params.OWNER", "compileParam", SCOPE);

			expect(deprecated).toEqual(current);
		});

		test("the $ prefix changes nothing", () => {
			expect(resolveReference("$instance.OWNER", "compileParam", SCOPE)).toEqual(
				resolveReference("instance.OWNER", "compileParam", SCOPE),
			);
			expect(resolveReference("$params.pubkey", "compileParam", SCOPE)).toEqual(
				resolveReference("params.pubkey", "compileParam", SCOPE),
			);
		});

		test("all four spellings of one instance field agree", () => {
			const results = [
				"instance.OWNER",
				"$instance.OWNER",
				"compile_params.OWNER",
				"$compile_params.OWNER",
			].map((text) => resolveReference(text, "compileParam", SCOPE));

			expect(new Set(results.map((result) => JSON.stringify(result))).size).toBe(1);
		});

		// Identical results, and still not silent about which generation the document is
		// from: the deprecation is recorded beside the normalisation layer's key renames,
		// where it informs a reader without changing a value.
		test("the deprecated namespace is recorded on the notes channel, not in the result", () => {
			const notes: Parameters<typeof resolveReference>[3] = [];

			resolveReference("compile_params.OWNER", "compileParam", SCOPE, notes);

			expect(notes).toContainEqual({
				at: "a compile parameter",
				canonical: "instance.",
				found: "compile_params.",
			});
		});

		test("the current namespace records nothing", () => {
			const notes: Parameters<typeof resolveReference>[3] = [];

			resolveReference("instance.OWNER", "compileParam", SCOPE, notes);

			expect(notes).toEqual([]);
		});
	});

	describe("a bare name is ambiguous by design", () => {
		test("resolves as a parameter first", () => {
			expect(resolveReference("shared", "amount", SCOPE)).toEqual({
				form: "bare",
				ok: true,
				value: "from params",
			});
		});

		test("falls back to an argument", () => {
			expect(resolveReference("note", "amount", SCOPE)).toEqual({
				form: "bare",
				ok: true,
				value: "from args",
			});
		});

		test("refuses a bare name that is neither", () => {
			expect(resolveReference("nowhere", "amount", SCOPE).ok).toBe(false);
		});
	});

	describe("what it refuses", () => {
		test("a namespace the scope does not carry", () => {
			const result = resolveReference("instance.OWNER", "compileParam", { params: {} });

			expect(result.ok ? "" : result.reason).toContain("instance");
		});

		test("a name the namespace does not carry, saying which name", () => {
			const result = resolveReference("params.missing", "compileParam", SCOPE);

			expect(result.ok ? "" : result.reason).toContain("missing");
		});

		test("an attribute of an input the wallet has not resolved", () => {
			expect(resolveReference("other_in.amount_sat", "amount", SCOPE).ok).toBe(false);
		});

		test("text that is not a reference at all", () => {
			const result = resolveReference("params.a + 1", "amount", SCOPE);

			expect(result.ok ? "" : result.reason).toContain("params.a + 1");
		});

		test("the fee before the wallet has established one", () => {
			expect(resolveReference("fee", "amount", { params: {} }).ok).toBe(false);
		});
	});
});
