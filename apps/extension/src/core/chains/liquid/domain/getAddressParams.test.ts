import { describe, expect, test } from "bun:test";

import { parseLiquidGetAddressParams } from "./validation";

describe("getAddress parameters", () => {
	test("default to the confidential first address", () => {
		expect(parseLiquidGetAddressParams(undefined)).toEqual({ confidential: true, index: 0 });
		expect(parseLiquidGetAddressParams({})).toEqual({ confidential: true, index: 0 });
	});

	test("take an index and the unconfidential form", () => {
		expect(parseLiquidGetAddressParams({ confidential: false, index: 7 })).toEqual({
			confidential: false,
			index: 7,
		});
	});

	test("reject a negative, fractional or hardened index", () => {
		expect(() => parseLiquidGetAddressParams({ index: -1 })).toThrow();
		expect(() => parseLiquidGetAddressParams({ index: 1.5 })).toThrow();
		expect(() => parseLiquidGetAddressParams({ index: 0x80000000 })).toThrow();
	});

	test("reject unknown fields", () => {
		expect(() => parseLiquidGetAddressParams({ change: 1 })).toThrow();
	});
});
