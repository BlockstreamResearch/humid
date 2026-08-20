// oxlint-disable consistent-function-scoping -- the helper belongs to the case it builds, and reading it beside the assertion is the point
import { describe, expect, test } from "bun:test";

import { encodeDataParts, encodeLeafItem } from "./encode";
import type { LeafPartResolver } from "./leafParts";

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

	/**
	 * The fourth shape: a kind of leaf carrying a list of parts.
	 *
	 * `tapdata` is the only kind this compiler builds — a hidden node hashed as
	 * `sha256(tag ‖ tag ‖ payload)` with `tag = sha256("TapData")` — so the payload is one run of
	 * bytes and the parts are that run. The expected bytes below are not this runtime's opinion:
	 * a live protocol writes these two leaves, its own contract rebuilds them from the flag and
	 * the debt, and its Rust program builder writes the same thirty-two bytes a third time.
	 */
	describe("a kind of leaf carrying a payload", () => {
		const nothing: LeafPartResolver = (reference) => ({
			ok: false,
			reason: `nothing carries "${reference}"`,
		});

		function payload(item: unknown, resolve?: LeafPartResolver) {
			const result = encodeLeafItem(item, {}, resolve);

			return result.ok ? result.hex : result.reason;
		}

		test("is the bytes of its one part", () => {
			expect(payload({ payload: ["0x0102"], type: "tapdata" })).toBe("0102");
		});

		test("concatenates several parts in the order they are written", () => {
			expect(payload({ payload: ["0xaa", { type: "u8", value: 1 }], type: "tapdata" })).toBe(
				"aa01",
			);
		});

		/** The flag slot of a live protocol's collateral covenant, active and pending. */
		test("writes a flag as the thirty-two bytes its contract hashes", () => {
			expect(payload({ payload: [`0x${"00".repeat(31)}01`], type: "tapdata" })).toBe(
				`${"00".repeat(31)}01`,
			);
		});

		/** The debt slot beside it: eight big-endian bytes right-aligned in thirty-two. */
		test("writes a debt big-endian, right-aligned in thirty-two bytes", () => {
			expect(
				payload({
					payload: [{ align: "right", endian: "be", pad_to: 32, type: "u64", value: 52_500 }],
					type: "tapdata",
				}),
			).toBe(`${"00".repeat(30)}cd14`);
		});

		test("a part may name something the caller resolves", () => {
			expect(
				payload(
					{
						payload: [
							{ align: "right", endian: "be", pad_to: 32, type: "u64", value: "instance.DEBT" },
						],
						type: "tapdata",
					},
					() => ({ ok: true, value: "52500" }),
				),
			).toBe(`${"00".repeat(30)}cd14`);
		});

		test("and a whole part may be the name, resolving to the bytes it stands for", () => {
			expect(
				payload({ payload: ["instance.TAG"], type: "tapdata" }, () => ({
					ok: true,
					value: "0xabcd",
				})),
			).toBe("abcd");
		});

		/**
		 * Which of the two mistakes this makes. Text the reference grammar accepts is looked up
		 * and refused when nothing carries it, so it can never become bytes that resemble a value;
		 * text it rejects is a literal, which `0x` in front settles for good.
		 */
		test("a part opening with a digit is a literal and is never looked up", () => {
			expect(payload({ payload: ["0011"], type: "tapdata" }, nothing)).toBe("0011");
		});

		test("a part that names something nothing carries refuses, naming the text", () => {
			expect(payload({ payload: ["MISSING"], type: "tapdata" }, nothing)).toContain("MISSING");
		});

		test("and refuses rather than guessing when there is nothing to resolve against", () => {
			expect(payload({ payload: ["MISSING"], type: "tapdata" })).toContain("resolve");
		});

		test("refuses a kind of leaf this compiler cannot build", () => {
			expect(payload({ payload: ["0x00"], type: "tapscript" })).toContain("tapscript");
		});

		test("refuses a leaf declaring a kind and saying nothing", () => {
			expect(payload({ type: "tapdata" })).toContain("payload");
		});

		test("refuses a payload that is not a list of parts", () => {
			expect(payload({ payload: "0x00", type: "tapdata" })).toContain("list of parts");
		});

		test("refuses an empty payload rather than hashing no bytes", () => {
			expect(payload({ payload: [], type: "tapdata" })).toContain("empty");
		});

		test("refuses a part carrying a payload of its own", () => {
			expect(
				payload({ payload: [{ payload: ["0x00"], type: "tapdata" }], type: "tapdata" }),
			).toContain("a part is a value");
		});

		test("names the part it could not encode, because position is the only name one has", () => {
			expect(payload({ payload: ["0x00", { type: "u128", value: 1 }], type: "tapdata" })).toContain(
				"payload part 2",
			);
		});
	});
});

// The second vocabulary, on an output's `data`, still reachable under the name the runtime
// calls it by. It is distinct from the first — a different set of types, the opposite integer
// default and no padding at all — and it now lives in `metadataParts.ts`, where each entry
// records what was measured. `metadataParts.test.ts` covers it; what is left here is that the
// old name still answers, and the two things this block used to assert about the vocabulary
// that turned out to be true of the other one.
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

	// This asserted the reverse, on the reasoning that a hand-written layout reads big-endian and
	// that the vocabulary had no key to say otherwise. Both halves were wrong: the key exists and
	// a published document writes it, and a deployed reader of these bytes takes every integer
	// width here little-endian.
	test("u64 is eight bytes, little-endian, which is this vocabulary's default", () => {
		expect(parts({ parts: [{ type: "u64", value: 1 }] })).toBe("0100000000000000");
	});

	// This named `u32`, which the vocabulary does have. `bytes32` is the honest example: the
	// first vocabulary has it, no document writes it at this position, so it stays refused.
	test("refuses a type this vocabulary does not have", () => {
		expect(parts({ parts: [{ type: "bytes32", value: `0x${"11".repeat(32)}` }] })).toContain(
			"bytes32",
		);
	});

	test("refuses the first vocabulary's padding keys, which mean nothing here", () => {
		expect(parts({ parts: [{ pad_to: 4, type: "u8", value: 1 }] })).toContain("pad_to");
		expect(parts({ parts: [{ align: "left", type: "u8", value: 1 }] })).toContain("align");
	});

	test("refuses data that is not a parts list", () => {
		expect(parts({ parts: "0x00" })).toContain("parts");
	});

	test("an empty parts list encodes to nothing", () => {
		expect(parts({ parts: [] })).toBe("");
	});
});
