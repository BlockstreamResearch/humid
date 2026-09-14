import { describe, expect, test } from "bun:test";

import type { NormalisationNote } from "./normalise";
import { parseReference, type ReferenceScope, resolveReference } from "./references";

/**
 * What a name may mean is decided by where it is written, not by what it looks like.
 *
 * That is the whole of this module and it is not a style choice: the same string is a legitimate
 * compile parameter at one position and nonsense at another, and nothing about the string says
 * which. Every test below asks the question at a position.
 */

const SCOPE: ReferenceScope = {
	args: { seat: "row-4" },
	instance: { TIMEOUT: "900000" },
	params: { amount_sat: "1000" },
};

describe("the namespaces a reference can name", () => {
	test("reads the request's parameters", () => {
		expect(resolveReference("params.amount_sat", "amount", SCOPE)).toEqual({
			form: "params",
			ok: true,
			value: "1000",
		});
	});

	test("reads them through the $-prefixed spelling too, which the corpus also writes", () => {
		expect(resolveReference("$params.amount_sat", "amount", SCOPE)).toMatchObject({
			ok: true,
			value: "1000",
		});
	});

	test("reads this deployment's field values", () => {
		expect(resolveReference("instance.TIMEOUT", "compileParam", SCOPE)).toEqual({
			form: "instance",
			ok: true,
			value: "900000",
		});
	});

	test("reads the request's arguments", () => {
		expect(resolveReference("args.seat", "compileParam", SCOPE)).toMatchObject({
			ok: true,
			value: "row-4",
		});
	});

	/**
	 * The format is mid-rename and both spellings are live in the corpus, one generation writing
	 * each. They are the same lookup, so they must be indistinguishable in the value — a
	 * deprecation marker riding on the result would make two documents that say the same thing
	 * behave differently downstream.
	 */
	test("reads the deprecated compile_params. namespace as the same lookup", () => {
		const notes: NormalisationNote[] = [];
		const deprecated = resolveReference("compile_params.TIMEOUT", "compileParam", SCOPE, notes);

		expect(deprecated).toEqual(resolveReference("instance.TIMEOUT", "compileParam", SCOPE));
		expect(notes).toContainEqual({
			at: "a compile parameter",
			canonical: "instance.",
			found: "compile_params.",
		});
	});

	/**
	 * An unqualified word is ambiguous by design: the format offers no way to say whether a
	 * parameter or an argument was meant. Parameters are tried first, which is the order the
	 * format's own reference implementation reads one in.
	 */
	test("reads a bare name as a parameter first and an argument second", () => {
		expect(resolveReference("amount_sat", "amount", SCOPE)).toMatchObject({ value: "1000" });
		expect(resolveReference("seat", "compileParam", SCOPE)).toMatchObject({ value: "row-4" });
	});
});

describe("what a name must come from", () => {
	test("a name nothing in scope supplies refuses rather than resolving to nothing", () => {
		const found = resolveReference("MISSING", "compileParam", SCOPE);

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("MISSING");
	});

	test("a namespace the request did not carry says so, rather than saying the name is absent", () => {
		const found = resolveReference("instance.TIMEOUT", "compileParam", { params: {} });

		expect(found.ok ? "" : found.reason).toContain("carries no instance");
	});

	/**
	 * Zero is a value. A reference that resolved to one where nothing was supplied would put a
	 * plausible number into an address, and there is nothing downstream that could tell.
	 */
	test("an absent value is not a zero", () => {
		expect(resolveReference("params.amount_sat", "amount", { params: {} }).ok).toBe(false);
	});
});

describe("what a position refuses", () => {
	/**
	 * A destination names an output's payee and the corpus writes only a parameter there. This
	 * deployment's fields resolve perfectly well at other positions and are not accepted here,
	 * which is the point: the lookup succeeding is not what decides whether it was allowed.
	 */
	test("a destination takes only a parameter, even where another form would resolve", () => {
		const found = resolveReference("instance.TIMEOUT", "destination", SCOPE);

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("cannot be used as a destination");
	});

	test("an attribute of a transaction input is recognised and refused by name", () => {
		expect(parseReference("vault_in.amount_sat")).toEqual({
			attribute: "amount_sat",
			form: "input-attribute",
			name: "vault_in",
		});

		const found = resolveReference("vault_in.amount_sat", "amount", SCOPE);

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("vault_in.amount_sat");
	});

	/**
	 * An expression whose terms include a reference is not a reference. Reading one would resolve
	 * the first term and lose the rest, which is an answer rather than an error.
	 */
	test("an expression is not a reference", () => {
		expect(parseReference("params.amount_sat - fee")).toBeUndefined();
		expect(resolveReference("params.amount_sat - fee", "amount", SCOPE).ok).toBe(false);
	});

	test("a bare value is not a reference either", () => {
		expect(parseReference("2")).toBeUndefined();
		expect(parseReference("0xdeadbeef")).toBeUndefined();
	});
});
