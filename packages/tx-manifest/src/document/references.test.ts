import { describe, expect, test } from "bun:test";

import { parseReference, type ReferenceScope, resolveReference } from "./references";

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

	test("no longer reads compile_params. as a namespace of its own", () => {
		const removed = resolveReference("compile_params.TIMEOUT", "compileParam", SCOPE);

		expect(removed).toEqual({
			ok: false,
			reason: '"compile_params.TIMEOUT" cannot be used as a compile parameter.',
		});
	});

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

	test("an absent value is not a zero", () => {
		expect(resolveReference("params.amount_sat", "amount", { params: {} }).ok).toBe(false);
	});
});

describe("what a position refuses", () => {
	test("a destination takes only a parameter, even where another form would resolve", () => {
		const found = resolveReference("instance.TIMEOUT", "destination", SCOPE);

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("cannot be used as a destination");
	});

	test("an attribute of a transaction input is recognised as the lookup it is", () => {
		expect(parseReference("vault_in.amount_sat")).toEqual({
			attribute: "amount_sat",
			form: "input-attribute",
			name: "vault_in",
		});
	});

	test("and resolves against the inputs this action actually resolved", () => {
		const found = resolveReference("vault_in.amount_sat", "amount", {
			...SCOPE,
			inputs: { vault_in: { amount_sat: 50_000n } },
		});

		expect(found).toEqual({ form: "input-attribute", ok: true, value: 50_000n });
	});

	test("and refuses an input this action never resolved, by name", () => {
		const found = resolveReference("vault_in.amount_sat", "amount", SCOPE);

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("vault_in");
	});

	test("an expression is not a reference", () => {
		expect(parseReference("params.amount_sat - fee")).toBeUndefined();
		expect(resolveReference("params.amount_sat - fee", "amount", SCOPE).ok).toBe(false);
	});

	test("a bare value is not a reference either", () => {
		expect(parseReference("2")).toBeUndefined();
		expect(parseReference("0xdeadbeef")).toBeUndefined();
	});
});
