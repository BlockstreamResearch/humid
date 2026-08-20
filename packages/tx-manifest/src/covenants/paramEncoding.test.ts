import { describe, expect, test } from "bun:test";

import { encodeCompileParam, encodesDeclaredType, unencodableReason } from "./paramEncoding";

/**
 * What each declared type encodes to, and — for every one of them — what it must not encode to.
 *
 * The second half is the point. A wrong encoding here does not fail: it compiles, derives a
 * perfectly well-formed address, and locks money at it. So each type is asserted against the
 * value it produces *and* against the value a plausible mistake would produce, so that a change
 * to either has to be made on purpose.
 */

const encode = (type: string, value: string) => encodeCompileParam(type, value, "P", "params.p");
const reasonOf = (result: ReturnType<typeof encode>) => (result.ok ? "" : result.reason);

const ASSET = "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec8ef5b4d5";
const ASSET_COMMITTED = "d5b4f58eec1ea15734ae22b7c46064412829c0d0579f0a713d1c04ede979026f";

describe("the integer widths", () => {
	test("are written as decimal, which is what the deployed factory's parameters are", () => {
		expect(encode("u8", "2")).toEqual({
			encoded: { type: "u8", value: "2" },
			ok: true,
		});
		expect(encode("u64", "0")).toEqual({ encoded: { type: "u64", value: "0" }, ok: true });
	});

	/**
	 * The failure this whole file exists for.
	 *
	 * `0x1000000000000000` is a legal `u64` in the compiler — sixteen hexadecimal characters is
	 * exactly eight bytes — and it is the number 1152921504606846976, not 1000000000000000. Both
	 * compile. Both derive an address. Only one of them is the covenant the document described.
	 */
	test("are never hex-prefixed, because a hex-prefixed amount is a different number", () => {
		const encoded = encode("u64", "1000000000000000");

		expect(encoded).toMatchObject({ encoded: { value: "1000000000000000" } });
		expect(reasonOf(encoded)).not.toContain("0x");
		expect(encoded.ok && encoded.encoded.value.startsWith("0x")).toBe(false);
	});

	test("refuse a value larger than the width it was declared at, naming both", () => {
		expect(reasonOf(encode("u8", "256"))).toContain("declared u8");
		expect(reasonOf(encode("u8", "256"))).toContain("0 to 255");
		expect(encode("u8", "255").ok).toBe(true);
		expect(encode("u16", "65535").ok).toBe(true);
		expect(encode("u16", "65536").ok).toBe(false);
		expect(encode("u32", "4294967295").ok).toBe(true);
		expect(encode("u32", "4294967296").ok).toBe(false);
		expect(encode("u64", "18446744073709551615").ok).toBe(true);
		expect(encode("u64", "18446744073709551616").ok).toBe(false);
	});

	test("refuse a value that is not a number at all, rather than passing it to the compiler", () => {
		expect(encode("u32", "0x10").ok).toBe(false);
		expect(encode("u64", "-1").ok).toBe(false);
		expect(encode("u64", "1e6").ok).toBe(false);
		expect(reasonOf(encode("u64", "later"))).toContain("P is wired to params.p");
	});
});

describe("an asset id", () => {
	/**
	 * A covenant reads an asset with `jet::input_amount` and compares the bits against its
	 * baked-in parameter, and what that jet reports is the asset as the transaction commits it —
	 * the reverse of the order every document, request and wallet screen states one in.
	 *
	 * Measured, not reasoned: `asset_auth.simf` compiled both ways and dry-run against a
	 * transaction carrying the asset. The committed order executed. The stated order failed
	 * inside the jet — after compiling, and after producing an address.
	 */
	test("is turned round, because a covenant compares against the committed order", () => {
		expect(encode("liquid.asset_id", ASSET)).toEqual({
			encoded: { type: "u256", value: `0x${ASSET_COMMITTED}` },
			ok: true,
		});
	});

	test("is not the value it was stated as, which is the mistake that would cost money", () => {
		const encoded = encode("liquid.asset_id", ASSET);

		expect(encoded.ok && encoded.encoded.value).not.toBe(`0x${ASSET}`);
	});

	test("turned round twice is itself, so nothing here depends on which end it started at", () => {
		const once = encode("liquid.asset_id", ASSET);
		const twice = encode("liquid.asset_id", once.ok ? once.encoded.value : "");

		expect(twice.ok && twice.encoded.value).toBe(`0x${ASSET}`);
	});

	test("of the wrong length is refused by length, before anything is turned round", () => {
		expect(reasonOf(encode("liquid.asset_id", "6f0279e9"))).toContain("8 hexadecimal characters");
		expect(reasonOf(encode("liquid.asset_id", "6f0279e9"))).toContain("asset id");
	});

	/** A hash is not an id: it has no stated order to be turned round from. */
	test("is turned round where a covenant hash of the same width is not", () => {
		const hash = encode("bytes32", ASSET);

		expect(hash).toMatchObject({ encoded: { type: "u256", value: `0x${ASSET}` } });
	});
});

describe("what has no encoding", () => {
	test("is refused by name, saying what the format has not said", () => {
		expect(encodesDeclaredType("address")).toBe(false);
		expect(unencodableReason("address")).toContain("rendering of a locking script");
		expect(encodesDeclaredType("bytes")).toBe(false);
		expect(unencodableReason("bytes")).toContain("carries no width");
		expect(encodesDeclaredType("string")).toBe(false);
	});

	test("tells a type nobody has mapped from a name nobody has heard of", () => {
		expect(unencodableReason("uint256")).toContain("does not encode yet");
		expect(unencodableReason(undefined)).toContain("unstated type");
	});

	test("never falls back to encoding it as something else", () => {
		for (const type of ["address", "bytes", "string", "uint256", "tapdata"]) {
			expect(encode(type, ASSET).ok).toBe(false);
		}
	});
});

describe("what was already encodable, unchanged", () => {
	const KEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

	test("a key, a hash and a flag", () => {
		expect(encode("pubkey", KEY)).toEqual({
			encoded: { type: "Pubkey", value: `0x${KEY}` },
			ok: true,
		});
		expect(encode("bytes32", `0x${KEY}`)).toMatchObject({ encoded: { type: "u256" } });
		expect(encode("bool", "true")).toEqual({ encoded: { type: "bool", value: "true" }, ok: true });
		expect(encode("bool", "1")).toMatchObject({ encoded: { value: "true" } });
		expect(encode("bool", "0")).toMatchObject({ encoded: { value: "false" } });
	});

	test("and a flag that is neither is refused rather than read as one of them", () => {
		expect(encode("bool", "maybe").ok).toBe(false);
		expect(encode("bool", "2").ok).toBe(false);
	});
});
