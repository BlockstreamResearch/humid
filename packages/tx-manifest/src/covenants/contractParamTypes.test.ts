import { describe, expect, test } from "bun:test";

import { encodeContractLiteral } from "./contractParamTypes";

/**
 * The types below are the compiler's own answer for the vendored contracts, read from
 * `contractParameterTypes` and pinned here so this file can be exercised without a compiler.
 * The adapter's own test proves the compiler still says this.
 */
const ASSET_AUTH = {
	declares: { ASSET_AMOUNT: "u64", ASSET_ID: "u256", WITH_ASSET_BURN: "bool" },
	source: "./asset_auth.simf",
};

describe("a value encoded from the type its contract declares", () => {
	test("a count is written as decimal at the width the contract declared", () => {
		expect(encodeContractLiteral("ASSET_AMOUNT", "1", ASSET_AUTH)).toEqual({
			encoded: { type: "u64", value: "1" },
			ok: true,
		});
	});

	test("a flag is written as the word the compiler reads", () => {
		expect(encodeContractLiteral("WITH_ASSET_BURN", "false", ASSET_AUTH)).toEqual({
			encoded: { type: "bool", value: "false" },
			ok: true,
		});

		expect(encodeContractLiteral("WITH_ASSET_BURN", "true", ASSET_AUTH)).toEqual({
			encoded: { type: "bool", value: "true" },
			ok: true,
		});
	});

	/**
	 * The width is the contract's, not the value's. `1` fits every integer type there is, so a
	 * runtime reading the value would have no reason to pick one — and every wrong pick is a
	 * different contract.
	 */
	test("the width comes from the contract even when the value would fit anything", () => {
		const narrower = { declares: { ASSET_AMOUNT: "u8" }, source: "./elsewhere.simf" };

		expect(encodeContractLiteral("ASSET_AMOUNT", "1", narrower)).toEqual({
			encoded: { type: "u8", value: "1" },
			ok: true,
		});
	});
});

describe("what it refuses rather than guessing", () => {
	test("a value too large for the width the contract declared", () => {
		const narrower = { declares: { ASSET_AMOUNT: "u8" }, source: "./asset_auth.simf" };
		const result = encodeContractLiteral("ASSET_AMOUNT", "256", narrower);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("0 to 255");
	});

	test("a flag written as anything but the two words it has", () => {
		const result = encodeContractLiteral("WITH_ASSET_BURN", "yes", ASSET_AUTH);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("true or false");
	});

	/**
	 * The refusal this issue exists to keep. A contract declares an asset id and a covenant hash
	 * with the same type, and they are written in opposite byte orders — so `u256` does not say
	 * which of the two a bare value is. A name does, because the format declares its type, which
	 * is why every thirty-two byte parameter in the corpus is wired to one.
	 */
	test("a thirty-two byte value, whose byte order its width does not decide", () => {
		const result = encodeContractLiteral("ASSET_ID", `0x${"ab".repeat(32)}`, ASSET_AUTH);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("byte order");
		expect(result.ok ? "" : result.reason).toContain("ASSET_ID");
		expect(result.ok ? "" : result.reason).toContain("./asset_auth.simf");
	});

	test("a parameter the contract does not declare, naming the contract that does not", () => {
		const result = encodeContractLiteral("NOT_A_PARAMETER", "1", ASSET_AUTH);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("NOT_A_PARAMETER");
		expect(result.ok ? "" : result.reason).toContain("./asset_auth.simf");
	});

	test("a type the contract really does declare that nobody has mapped", () => {
		const other = { declares: { COUNT: "u128" }, source: "./other.simf" };
		const result = encodeContractLiteral("COUNT", "1", other);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("u128");
		expect(result.ok ? "" : result.reason).toContain("./other.simf");
	});
});

/**
 * The invariant that makes a mapping mistake impossible to ship.
 *
 * The compiler requires an argument's type to equal its parameter's exactly. Anything typed
 * differently from what the contract declared would be refused there — but with a message that
 * names neither the document nor the parameter, and only after everything else had gone right.
 */
describe("what it emits is typed as the contract declared it", () => {
	for (const [declaredType, value] of [
		["bool", "true"],
		["u8", "7"],
		["u16", "7"],
		["u32", "7"],
		["u64", "7"],
	] as const) {
		test(`${declaredType} is emitted as ${declaredType}`, () => {
			const result = encodeContractLiteral("P", value, {
				declares: { P: declaredType },
				source: "./c.simf",
			});

			expect(result.ok && result.encoded.type).toBe(declaredType);
		});
	}
});
