import { describe, expect, test } from "bun:test";

import { ShownAsset } from "./ShownAsset";

const ID = "3f9a8d6c2b1e4f7a9c0d5e3b8a6f1c2d4e7b9a0c3d5f8e1b2a4c6d9f0e3c21e";

describe("ShownAsset", () => {
	test("shows a known asset as whole tokens with its ticker", () => {
		const lbtc = new ShownAsset(ID, "L-BTC", 8);

		expect(lbtc.amount(500_000n)).toBe("0.005");
		expect(lbtc.amount(-500_000n, true)).toBe("−0.005");
		expect(lbtc.amountWithLabel(1_000_000n)).toBe("0.01 L-BTC");
		expect(lbtc.note).toBeUndefined();
	});

	test("cuts an unknown asset to the first and last four characters", () => {
		const unknown = new ShownAsset(ID, undefined, 0);

		expect(unknown.label).toBe("3f9a…c21e");
		expect(unknown.amountWithLabel(1n)).toBe("1 · 3f9a…c21e");
		expect(unknown.note).toBe("Unknown asset");
	});

	test("falls back to raw units when the decimals are unknown", () => {
		expect(new ShownAsset(ID).amount(1_234n, true)).toBe("+1234");
		expect(new ShownAsset(ID).note).toBe("Unknown asset, raw units");
		expect(new ShownAsset(ID, "TOKEN").note).toBe("Raw units");
	});
});
