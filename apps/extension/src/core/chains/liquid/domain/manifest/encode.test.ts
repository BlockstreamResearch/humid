import { describe, expect, test } from "bun:test";

import { encodeDataParts, encodeLeafItem } from "./encode";

// The vocabulary comes from the cross-source inventory, which read it out of the reference
// implementation's `encode_leaf_bytes`: type is one of u8/u16/u32/u64 or
// bytes32/bytes/pubkey; endian defaults to little and "be" reverses; pad_to errors rather
// than truncating; align defaults to right. Anything else is rejected outright, because a
// value encoded wrong produces a well-formed address for the wrong contract.

function hex(item: unknown, stateVars: Record<string, unknown> = {}): string {
	const result = encodeLeafItem(item, stateVars);

	return result.ok ? result.hex : result.reason;
}

describe("encodeLeafItem", () => {
	describe("a hex literal", () => {
		test("passes through", () => {
			expect(hex("0x0102")).toBe("0102");
		});

		test("is accepted without the prefix", () => {
			expect(hex("0102")).toBe("0102");
		});

		test("is refused when it is not hex", () => {
			expect(hex("0xzz")).toContain("not");
		});

		test("is refused when it has an odd number of digits", () => {
			expect(hex("0x010")).toContain("whole");
		});
	});

	describe("integer widths", () => {
		test("u8 is one byte", () => {
			expect(hex({ type: "u8", value: 1 })).toBe("01");
		});

		test("u16 is two, little-endian by default", () => {
			expect(hex({ type: "u16", value: 1 })).toBe("0100");
		});

		test("u32 is four", () => {
			expect(hex({ type: "u32", value: 1 })).toBe("01000000");
		});

		test("u64 is eight", () => {
			expect(hex({ type: "u64", value: 1 })).toBe("0100000000000000");
		});

		test("big-endian reverses it", () => {
			expect(hex({ endian: "be", type: "u32", value: 1 })).toBe("00000001");
		});

		test("anything other than be is little-endian, as the default is", () => {
			expect(hex({ endian: "le", type: "u32", value: 1 })).toBe("01000000");
		});

		test("a decimal string is read as the number it spells", () => {
			expect(hex({ type: "u16", value: "258" })).toBe("0201");
		});

		test("a value too large for its width is refused rather than truncated", () => {
			expect(hex({ type: "u8", value: 256 })).toContain("u8");
		});

		test("a negative value is refused", () => {
			expect(hex({ type: "u8", value: -1 })).toContain("negative");
		});

		test("a value beyond a double's range survives as a decimal string", () => {
			expect(hex({ endian: "be", type: "u64", value: "9007199254740993" })).toBe(
				"0020000000000001",
			);
		});
	});

	describe("byte types", () => {
		test("bytes takes hex as it is", () => {
			expect(hex({ type: "bytes", value: "0xdeadbeef" })).toBe("deadbeef");
		});

		test("bytes32 requires thirty-two", () => {
			expect(hex({ type: "bytes32", value: `0x${"11".repeat(32)}` })).toBe("11".repeat(32));
			expect(hex({ type: "bytes32", value: "0x1122" })).toContain("bytes32");
		});

		test("pubkey requires thirty-two", () => {
			expect(hex({ type: "pubkey", value: `0x${"22".repeat(32)}` })).toBe("22".repeat(32));
			expect(hex({ type: "pubkey", value: "0x2233" })).toContain("pubkey");
		});

		test("big-endian reverses bytes too", () => {
			expect(hex({ endian: "be", type: "bytes", value: "0x0102" })).toBe("0201");
		});
	});

	describe("padding", () => {
		test("pads in front by default, which is what right alignment means", () => {
			expect(hex({ pad_to: 4, type: "u8", value: 1 })).toBe("00000001");
		});

		test("left alignment puts the value first and the zeros after", () => {
			expect(hex({ align: "left", pad_to: 4, type: "u8", value: 1 })).toBe("01000000");
		});

		test("anything other than left is right, as the default is", () => {
			expect(hex({ align: "centre", pad_to: 2, type: "u8", value: 1 })).toBe("0001");
		});

		test("a value longer than the target is an error, never a truncation", () => {
			expect(hex({ pad_to: 1, type: "u32", value: 1 })).toContain("longer");
		});

		test("a target equal to the length changes nothing", () => {
			expect(hex({ pad_to: 4, type: "u32", value: 1 })).toBe("01000000");
		});
	});

	describe("a state variable", () => {
		test("resolves to its default value as one byte", () => {
			expect(hex({ state_var: "counter" }, { counter: { default_value: 7 } })).toBe("07");
		});

		test("is refused when the utxo type declares no such variable", () => {
			expect(hex({ state_var: "missing" }, {})).toContain("missing");
		});

		test("is refused when its default does not fit in a byte", () => {
			expect(hex({ state_var: "big" }, { big: { default_value: 256 } })).toContain("u8");
		});
	});

	describe("what it refuses outright", () => {
		test("a type nobody has mapped", () => {
			expect(hex({ type: "u128", value: 1 })).toContain("u128");
		});

		test("an item that is neither a literal, a typed value nor a state variable", () => {
			expect(hex(42)).toContain("not");
		});

		test("a typed item with no value", () => {
			expect(hex({ type: "u8" })).toContain("value");
		});
	});
});

// The second vocabulary, on an output's `data`. Distinct from the first: no endian, no
// padding, and only three types. Written separately rather than folded into the first,
// because a shared encoder would silently accept `endian` here where the format has none.
describe("encodeDataParts", () => {
	function parts(value: unknown): string {
		const result = encodeDataParts(value);

		return result.ok ? result.hex : result.reason;
	}

	test("concatenates its parts in order", () => {
		expect(
			parts({
				parts: [
					{ type: "u8", value: 1 },
					{ type: "bytes", value: "0xabcd" },
				],
			}),
		).toBe("01abcd");
	});

	test("u64 is eight bytes, big-endian, as this vocabulary has no endian to choose", () => {
		expect(parts({ parts: [{ type: "u64", value: 1 }] })).toBe("0000000000000001");
	});

	test("refuses a type this vocabulary does not have", () => {
		expect(parts({ parts: [{ type: "u32", value: 1 }] })).toContain("u32");
	});

	test("refuses the first vocabulary's keys, which mean nothing here", () => {
		expect(parts({ parts: [{ endian: "be", type: "u8", value: 1 }] })).toContain("endian");
	});

	test("refuses data that is not a parts list", () => {
		expect(parts({ parts: "0x00" })).toContain("parts");
	});

	test("an empty parts list encodes to nothing", () => {
		expect(parts({ parts: [] })).toBe("");
	});
});
