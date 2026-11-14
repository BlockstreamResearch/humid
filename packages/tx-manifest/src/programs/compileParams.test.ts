import { describe, expect, test } from "bun:test";

import { refusalOf } from "../review/reviewForTests";
import { parseReference } from "../values/references";
import { Scope } from "../values/scope";
import { resolveCompileParams } from "./compileParams";

const HASH = "ab".repeat(32);
const CONTRACT = { declares: { FLAG: "bool", KEY: "u256" }, source: "./k.simf" };
const SCOPE = new Scope({ instance: { STORED: HASH }, params: {} });

const compiled = (wiring: Record<string, string>, declaredAtUse?: Record<string, string>) =>
	resolveCompileParams(wiring, { STORED: "bytes32" }, SCOPE, CONTRACT, declaredAtUse);

describe("a word in a program argument", () => {
	test("true and false are values, never names", () => {
		expect(parseReference("true")).toBeUndefined();
		expect(compiled({ FLAG: "false" })).toEqual({ FLAG: { type: "bool", value: "false" } });
	});

	test("any other word names an instance field, and one that names none is refused", () => {
		expect(compiled({ KEY: "STORED" })).toEqual({ KEY: { type: "u256", value: `0x${HASH}` } });
		expect(refusalOf(() => compiled({ KEY: HASH })).reason).toContain("carries no");
	});

	test("hex is a value only where written with 0x", () => {
		expect(compiled({ KEY: `0x${HASH}` }, { KEY: "bytes32" })).toEqual({
			KEY: { type: "u256", value: `0x${HASH}` },
		});
	});
});
