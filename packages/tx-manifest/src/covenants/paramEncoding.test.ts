import { describe, expect, test } from "bun:test";

import { encodeCompileParam, encodesDeclaredType, unencodableReason } from "./paramEncoding";

/**
 * What a value is encoded as comes from the type it was declared at, and from nothing else.
 *
 * Every case below could be got wrong in a way that compiles: the compiler accepts almost
 * anything shaped like a value and hands back a perfectly valid address for the wrong contract.
 * That is why the list of types is closed and why a value's own appearance decides nothing.
 */

const KEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const encode = (type: string, value: string) => encodeCompileParam(type, value, "P", "a value");

describe("the fixed-width types", () => {
	test("a public key is written as hex of exactly its width", () => {
		expect(encode("pubkey", KEY)).toEqual({
			encoded: { type: "Pubkey", value: `0x${KEY}` },
			ok: true,
		});
	});

	test("a covenant hash is thirty-two bytes and is not turned round", () => {
		const hash = `ab${"00".repeat(30)}cd`;

		expect(encode("bytes32", hash)).toMatchObject({ encoded: { value: `0x${hash}` } });
	});

	/**
	 * An asset id is stated one way and committed in the reverse of it. A covenant compares what
	 * a jet reports — the committed form — against its baked-in parameter, so the turn belongs
	 * here, at the one place a stated id becomes bytes a contract is built with. Passed through,
	 * it compiles, derives an address, and is wrong.
	 */
	test("an asset id is turned round on the way in, where a hash of the same width is not", () => {
		const stated = `a0${"00".repeat(30)}0a`;
		const committed = `0a${"00".repeat(30)}a0`;

		expect(encode("liquid.asset_id", stated)).toMatchObject({
			encoded: { type: "u256", value: `0x${committed}` },
		});
		expect(encode("bytes32", stated)).toMatchObject({ encoded: { value: `0x${stated}` } });
	});

	test("a value of the wrong width refuses, saying how wide it was", () => {
		const found = encode("pubkey", "79be667e");

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("8 hexadecimal characters");
	});

	test("an already-prefixed value is accepted rather than doubled", () => {
		expect(encode("pubkey", `0x${KEY}`)).toMatchObject({ encoded: { value: `0x${KEY}` } });
	});
});

describe("the integer widths", () => {
	/**
	 * A number is hex-prefixed nowhere, and that is a rule rather than a convention. The compiler
	 * reads `0x…` as a hexadecimal literal of exactly the type's width, so a decimal amount that
	 * happens to be sixteen characters long would be a legal `u64` hexadecimal literal standing
	 * for an entirely different number. It compiles, and it says nothing.
	 */
	test("are written as decimal, never as hex", () => {
		expect(encode("u64", "1000000000000000")).toEqual({
			encoded: { type: "u64", value: "1000000000000000" },
			ok: true,
		});
	});

	test("refuse a value too large for the width it was declared at, naming the range", () => {
		const found = encode("u32", "4294967296");

		expect(found.ok).toBe(false);
		expect(found.ok ? "" : found.reason).toContain("0 to 4294967295");
	});

	test("accept the largest value the width holds", () => {
		expect(encode("u8", "255")).toMatchObject({ encoded: { value: "255" } });
		expect(encode("u8", "256").ok).toBe(false);
	});

	test("read a leading zero as the number it writes", () => {
		expect(encode("u16", "0005")).toMatchObject({ encoded: { value: "5" } });
	});

	test("refuse anything that is not a run of digits", () => {
		expect(encode("u64", "0x10").ok).toBe(false);
		expect(encode("u64", "-1").ok).toBe(false);
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
			expect(encode("bool", written)).toMatchObject({ encoded: { type: "bool", value: expected } });
		}
	});

	/** A value quietly read as `false` is a different covenant, and it is one that compiles. */
	test("refuse anything else rather than treating it as one of them", () => {
		expect(encode("bool", "yes").ok).toBe(false);
		expect(encode("bool", "").ok).toBe(false);
	});
});

describe("the types with no encoding", () => {
	test("are refused by name rather than passed through", () => {
		for (const type of ["address", "bytes", "string"]) {
			expect(encodesDeclaredType(type)).toBe(false);
			expect(encode(type, "anything").ok).toBe(false);
		}
	});

	/**
	 * A type the format names and this runtime has not mapped is told apart from one nobody has
	 * heard of. They call for different things: the first waits on a decision about what it means,
	 * and the second is usually a typo in the document.
	 */
	test("say why, where the reason is a decision nobody has made", () => {
		expect(unencodableReason("bytes")).toContain("carries no width");
		expect(unencodableReason("u128")).toContain("does not encode yet");
		expect(unencodableReason(undefined)).toContain("unstated type");
	});
});
