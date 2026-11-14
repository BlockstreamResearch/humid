import { describe, expect, test } from "bun:test";

import { Refusal } from "../refusal";
import { refusalOf } from "../review/reviewForTests";
import { FormatType } from "./formatTypes";

const KEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const encode = (type: string, value: string) => FormatType.named(type).argument(value);

describe("the fixed-width types", () => {
	test("a public key is written as hex of exactly its width", () => {
		expect(encode("pubkey", KEY)).toEqual({ type: "Pubkey", value: `0x${KEY}` });
	});

	test("a program hash is thirty-two bytes and is not turned round", () => {
		const hash = `ab${"00".repeat(30)}cd`;

		expect(encode("bytes32", hash)).toMatchObject({ value: `0x${hash}` });
	});

	test("an asset id is turned round on the way in, where a hash of the same width is not", () => {
		const stated = `a0${"00".repeat(30)}0a`;
		const committed = `0a${"00".repeat(30)}a0`;

		expect(encode("liquid.asset_id", stated)).toEqual({ type: "u256", value: `0x${committed}` });
		expect(encode("bytes32", stated)).toMatchObject({ value: `0x${stated}` });
	});

	test("a value of the wrong width refuses, saying how wide it was", () => {
		const found = refusalOf(() => encode("pubkey", "79be667e"));

		expect(found.reason).toContain("8 hexadecimal characters");
	});

	test("an already-prefixed value is accepted rather than doubled", () => {
		expect(encode("pubkey", `0x${KEY}`)).toMatchObject({ value: `0x${KEY}` });
	});
});

describe("the integer widths", () => {
	test("are written as decimal, never as hex", () => {
		expect(encode("u64", "1000000000000000")).toEqual({ type: "u64", value: "1000000000000000" });
	});

	test("refuse a value too large for the width it was declared at, naming the range", () => {
		const found = refusalOf(() => encode("u32", "4294967296"));

		expect(found.reason).toContain("0 to 4294967295");
	});

	test("accept the largest value the width holds", () => {
		expect(encode("u8", "255")).toMatchObject({ value: "255" });
		expect(() => encode("u8", "256")).toThrow(Refusal);
	});

	test("read a leading zero as the number it writes", () => {
		expect(encode("u16", "0005")).toMatchObject({ value: "5" });
	});

	test("refuse anything that is not a run of digits", () => {
		expect(() => encode("u64", "0x10")).toThrow(Refusal);
		expect(() => encode("u64", "-1")).toThrow(Refusal);
	});
});

describe("flags", () => {
	test("read the two words the compiler reads and the two bits the corpus writes", () => {
		for (const [written, expected] of [
			["true", "true"],
			["false", "false"],
			["1", "true"],
			["0", "false"],
		] as const) {
			expect(encode("bool", written)).toMatchObject({ type: "bool", value: expected });
		}
	});

	test("refuse anything else rather than treating it as one of them", () => {
		expect(() => encode("bool", "yes")).toThrow(Refusal);
		expect(() => encode("bool", "")).toThrow(Refusal);
	});
});

describe("the types a program cannot be built with", () => {
	test("are refused by name rather than passed through", () => {
		for (const type of ["address", "bytes", "string"]) {
			expect(() => encode(type, "00")).toThrow(Refusal);
		}
	});

	test("say why, where the reason is a decision nobody has made", () => {
		expect(refusalOf(() => encode("bytes", "00")).reason).toContain("carries no width");
		expect(refusalOf(() => encode("u128", "1")).reason).toContain("does not encode yet");
		expect(refusalOf(() => FormatType.named(undefined)).reason).toContain("unstated type");
	});
});

describe("a value a contract declares but the document does not type", () => {
	test("is encoded where the contract's type names one format type", () => {
		expect(FormatType.ofCompilerType("u32").argument("7")).toEqual({ type: "u32", value: "7" });
	});

	test("is refused where it names several, which commit their bytes in different orders", () => {
		expect(refusalOf(() => FormatType.ofCompilerType("u256")).reason).toContain(
			"bytes32 and liquid.asset_id",
		);
	});
});

describe("the bytes a value is", () => {
	test("are big-endian for an integer, and as written for hex, whatever order a program commits", () => {
		expect([...FormatType.named("u16").bytes("258")]).toEqual([1, 2]);
		expect([...FormatType.named("liquid.asset_id").bytes(`01${"00".repeat(31)}`)][0]).toBe(1);
	});

	test("are any even run of hex for the type with no width", () => {
		expect([...FormatType.named("bytes").bytes("0x0102")]).toEqual([1, 2]);
	});
});
