import { describe, expect, test } from "bun:test";

import { serializeError } from "./serializeError";

describe("serializeError", () => {
	test("an ordinary error keeps its message", () => {
		expect(serializeError(new Error("plain"))).toEqual({ message: "plain" });
	});

	test("the code and data a dapp branches on survive", () => {
		const error = Object.assign(new Error("Refused."), {
			code: -32_602,
			data: { reason: "invalid_manifest_request" },
		});

		expect(serializeError(error)).toEqual({
			code: -32_602,
			data: { reason: "invalid_manifest_request" },
			message: "Refused.",
		});
	});

	// The reason a handler wraps a failure at all: the wrapper is stable and the cause is what
	// actually went wrong. Dropping the cause left the wrapper's sentence as the whole story.
	test("the cause survives the boundary", () => {
		const wrapper = new Error("Could not build, sign, and broadcast the Liquid transfer.");
		wrapper.cause = new Error("InsufficientFunds: missing 1200 satoshi");

		expect(serializeError(wrapper)).toEqual({
			cause: { message: "InsufficientFunds: missing 1200 satoshi" },
			message: "Could not build, sign, and broadcast the Liquid transfer.",
		});
	});

	test("a chain several deep survives in order", () => {
		const third = new Error("third");
		const second = new Error("second");
		second.cause = third;
		const first = new Error("first");
		first.cause = second;

		expect(serializeError(first)).toEqual({
			cause: { cause: { message: "third" }, message: "second" },
			message: "first",
		});
	});

	// A cause chain can be circular, and this runs inside the message boundary — an unbounded
	// walk here is a hung background rather than a bad message.
	test("a circular chain terminates", () => {
		const first = new Error("first");
		const second = new Error("second");
		first.cause = second;
		second.cause = first;

		const serialized = JSON.stringify(serializeError(first));

		expect(serialized.length).toBeLessThan(500);
		expect(serialized).toContain("first");
	});

	test("something that is not an error is passed through unchanged", () => {
		expect(serializeError("just a string")).toBe("just a string");
		expect(serializeError({ shape: "unknown" })).toEqual({ shape: "unknown" });
	});
});
