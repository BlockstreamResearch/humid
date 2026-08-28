import { describe, expect, test } from "bun:test";

import { toError } from "./toError";

// What the background actually sends: a thrown Error is serialised structurally so a dapp can
// branch on the code. Every one of these shapes has to reach a person as words.
describe("toError", () => {
	test("a serialised error arrives as its message", () => {
		expect(toError({ message: "This account holds 0 of the 1377 needed." }).message).toBe(
			"This account holds 0 of the 1377 needed.",
		);
	});

	test("the structured fields survive, so a caller can still branch on them", () => {
		const error = toError({ code: -32_602, data: { reason: "invalid" }, message: "Refused." });

		expect(error.message).toBe("Refused.");
		expect(error).toMatchObject({ code: -32_602, data: { reason: "invalid" } });
	});

	test("a plain string is already the message", () => {
		expect(toError("No handler for method: foo").message).toBe("No handler for method: foo");
	});

	// The failure this replaces: String({message}) is "[object Object]", so the one place the
	// message was written for a person is the one place it did not arrive.
	test("nothing renders as [object Object]", () => {
		for (const raw of [
			{ message: "readable" },
			{ unexpected: "shape" },
			["a", "b"],
			42,
			null,
			undefined,
		]) {
			expect(toError(raw).message).not.toContain("[object Object]");
		}
	});

	test("an object with no message is shown as itself rather than as its type", () => {
		expect(toError({ unexpected: "shape" }).message).toBe('{"unexpected":"shape"}');
	});

	test("something that cannot be described still says something", () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;

		expect(toError(circular).message).toBe("The extension failed and did not say why.");
	});
});

// A handler wraps a failure in a stable wallet error and attaches the real reason underneath.
// Only the message reaches a screen, so the chain has to be in it.
describe("toError and the cause chain", () => {
	test("the reason underneath reaches the message", () => {
		const error = toError({
			cause: { message: "InsufficientFunds: missing 1200 satoshi" },
			code: -32_002,
			message: "Could not build, sign, and broadcast the Liquid transfer.",
		});

		expect(error.message).toBe(
			"Could not build, sign, and broadcast the Liquid transfer. — caused by: InsufficientFunds: missing 1200 satoshi",
		);
	});

	test("the cause is kept as an error too, for a caller that wants the parts", () => {
		const error = toError({ cause: { message: "underneath" }, message: "wrapper" });

		expect((error as Error & { cause?: Error }).cause?.message).toBe("underneath");
	});

	test("a wrapper that only restates its cause does not say it twice", () => {
		expect(toError({ cause: { message: "same" }, message: "same" }).message).toBe("same");
	});

	test("a chain several deep reads in order", () => {
		const error = toError({
			cause: { cause: { message: "third" }, message: "second" },
			message: "first",
		});

		expect(error.message).toBe("first — caused by: second — caused by: third");
	});

	test("no cause reads exactly as it did before", () => {
		expect(toError({ message: "alone" }).message).toBe("alone");
	});
});
