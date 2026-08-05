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
