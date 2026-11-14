import { describe, expect, test } from "bun:test";

import type { Action } from "../document/manifest";
import { refusalOf, actionOf } from "../review/reviewForTests";
import { Scope } from "../values/scope";
import { resolveInputRules } from "./inputRules";

function sequenceOf(sequence: unknown, params: Record<string, unknown> = {}) {
	const action: Action = actionOf("Act", {
		inputs: [{ id: "a", sequence, utxo_source: "wallet" }],
	});

	return resolveInputRules(action, new Scope({ params }))[0]?.sequence;
}

describe("the sequence an input declares", () => {
	test("is taken as written when the input states a number", () => {
		expect(sequenceOf(4_294_967_294)).toBe(4_294_967_294);
	});

	test("is a block count when the input waits blocks", () => {
		expect(sequenceOf({ relative_blocks: 25_920 })).toBe(25_920);
	});

	test("is a count of 512-second units, rounded up and marked as time, when the input waits seconds", () => {
		expect(sequenceOf({ relative_seconds: 1025 })).toBe(0x40_00_00 | 3);
	});

	test("reads an expression the input waits on", () => {
		expect(sequenceOf({ relative_blocks: "params.WAIT" }, { WAIT: "144" })).toBe(144);
	});

	test("refuses a wait no relative timelock can express", () => {
		expect(refusalOf(() => sequenceOf({ relative_blocks: 65_536 })).reason).toContain("65536");
		expect(refusalOf(() => sequenceOf({ relative_seconds: 65_536 * 512 })).reject).toBe(
			"document-fault",
		);
	});

	test("refuses a sequence of something other than a number or a wait", () => {
		expect(refusalOf(() => sequenceOf({ forever: true })).reject).toBe("document-fault");
	});
});
