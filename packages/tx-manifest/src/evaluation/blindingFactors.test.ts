import { describe, expect, test } from "bun:test";

import { refusalOf } from "../review/reviewForTests";
import { resolveBlindingFactors } from "./blindingFactors";

const ONE = `01${"00".repeat(31)}`;

const factors = (declared: unknown, params: Record<string, unknown> = {}) =>
	resolveBlindingFactors(declared, { params });

describe("the blinding factors a manifest states", () => {
	test("are scalars, written in the byte order the signer reads", () => {
		expect(factors({ asset_bf: "1", value_bf: 1 })).toEqual({
			assetBlindingFactor: ONE,
			valueBlindingFactor: ONE,
		});
	});

	test("read hex as a big-endian scalar", () => {
		expect(factors({ asset_bf: "0x0102" }).assetBlindingFactor).toBe(`0201${"00".repeat(30)}`);
	});

	test("work out an expression, so a covenant can advance the factor it spends", () => {
		expect(factors({ value_bf: "params.FACTOR + 1" }, { FACTOR: 1 }).valueBlindingFactor).toBe(
			`02${"00".repeat(31)}`,
		);
	});

	test("leave a factor the manifest does not state to the signer", () => {
		expect(factors({ asset_bf: "1" })).toEqual({ assetBlindingFactor: ONE });
	});

	test("refuse a factor that does not fit in 32 bytes", () => {
		expect(refusalOf(() => factors({ asset_bf: `0x1${"00".repeat(32)}` })).reject).toBe(
			"document-fault",
		);
	});

	test("refuse something that is not a set of factors", () => {
		expect(refusalOf(() => factors("1")).reject).toBe("document-fault");
	});
});
