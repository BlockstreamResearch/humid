import { describe, expect, test } from "bun:test";

import { Refusal } from "../refusal";
import { refusalOf } from "../review/reviewForTests";
import { Scope, type ScopeParts } from "../values/scope";
import { parseReference, type ReferencePosition } from "./references";

const SCOPE: ScopeParts = {
	instance: { TIMEOUT: "900000" },
	params: { amount_sat: "1000" },
};

const resolved = (text: string, position: ReferencePosition, parts: ScopeParts) =>
	new Scope(parts).reference(text, position);

describe("the namespaces a reference can name", () => {
	test("reads the request's parameters", () => {
		expect(resolved("params.amount_sat", "amount", SCOPE)).toBe("1000");
	});

	test("has one spelling, without a $ prefix", () => {
		expect(parseReference("$params.amount_sat")).toBeUndefined();
	});

	test("reads this deployment's field values", () => {
		expect(resolved("instance.TIMEOUT", "compileParam", SCOPE)).toBe("900000");
	});

	test("reads an action parameter as a field where the deployment has no such field", () => {
		expect(resolved("instance.amount_sat", "amount", SCOPE)).toBe("1000");
	});

	test("but a field the deployment has wins over a parameter of the same name", () => {
		const scope = { instance: { TIMEOUT: "900000" }, params: { TIMEOUT: "1" } };

		expect(resolved("instance.TIMEOUT", "amount", scope)).toBe("900000");
	});

	test("reads a bare name as a deployment field where a program argument goes", () => {
		expect(resolved("TIMEOUT", "compileParam", SCOPE)).toBe("900000");
	});

	test("reads a bare name elsewhere only as the fee or an attribute of the input a hook runs on", () => {
		const scope = { ...SCOPE, fee: 42n, self: { asset: "ab".repeat(32) } };

		expect(resolved("fee", "amount", scope)).toBe(42n);
		expect(resolved("asset", "expression", scope)).toBe("ab".repeat(32));
		expect(refusalOf(() => resolved("amount_sat", "amount", scope)).reason).toContain(
			"params.amount_sat",
		);
	});
});

describe("what a name must come from", () => {
	test("a name nothing in scope supplies refuses rather than resolving to nothing", () => {
		const found = refusalOf(() => resolved("MISSING", "compileParam", SCOPE));

		expect(found.reason).toContain("MISSING");
	});

	test("a namespace the request did not carry says so, rather than saying the name is absent", () => {
		const found = refusalOf(() => resolved("instance.TIMEOUT", "compileParam", { params: {} }));

		expect(found.reason).toContain("carries no instance");
	});

	test("an absent value is not a zero", () => {
		expect(() => resolved("params.amount_sat", "amount", { params: {} })).toThrow(Refusal);
	});
});

describe("what a position refuses", () => {
	test("a destination takes a parameter or a deployment field, and no input attribute", () => {
		expect(resolved("instance.TIMEOUT", "destination", SCOPE)).toBe("900000");
		expect(refusalOf(() => resolved("vault_in.amount_sat", "destination", SCOPE)).reason).toContain(
			"cannot be used as a destination",
		);
	});

	test("an attribute of a transaction input is written as the input's id and the attribute", () => {
		expect(parseReference("vault_in.amount_sat")).toEqual({
			attribute: "amount_sat",
			form: "input-attribute",
			name: "vault_in",
		});
		expect(parseReference("inputs.vault_in.amount_sat")).toBeUndefined();
	});

	test("and resolves against the inputs this action actually resolved", () => {
		const found = resolved("vault_in.amount_sat", "amount", {
			...SCOPE,
			inputs: { vault_in: { amount_sat: 50_000n } },
		});

		expect(found).toBe(50_000n);
	});

	test("and refuses an input this action never resolved, by name", () => {
		const found = refusalOf(() => resolved("vault_in.amount_sat", "amount", SCOPE));

		expect(found.reason).toContain("vault_in");
	});

	test("an expression is not a reference", () => {
		expect(parseReference("params.amount_sat - fee")).toBeUndefined();
		expect(() => resolved("params.amount_sat - fee", "amount", SCOPE)).toThrow(Refusal);
	});

	test("a bare value is not a reference either", () => {
		expect(parseReference("2")).toBeUndefined();
		expect(parseReference("0xdeadbeef")).toBeUndefined();
	});
});
