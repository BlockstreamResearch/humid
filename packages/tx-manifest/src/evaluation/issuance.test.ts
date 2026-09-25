import { describe, expect, test } from "bun:test";

import { deriveNewIssuance } from "../chain/issuance";
import { declaredIssuance, issuanceAttributes, resolveIssuance } from "./issuance";

const OUTPOINT = { txid: "c".repeat(64), vout: 2 };
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

function resolve(declared: Record<string, unknown>, params: Record<string, unknown> = {}) {
	return resolveIssuance({ declared, id: "mint_in", outpoint: OUTPOINT }, { params });
}

describe("the issuance an input declares", () => {
	test("is found where the input declares one, and nowhere else", () => {
		expect(declaredIssuance({ issuance: { kind: "new" } })).toEqual({ kind: "new" });
		expect(declaredIssuance({ id: "funding_in" })).toBeUndefined();
	});
});

describe("what this wallet will mint", () => {
	test("a new asset, derived from the very output the input spends", () => {
		const result = resolve({ asset_amount_sat: 1000, kind: "new" });
		const derived = deriveNewIssuance(OUTPOINT);

		expect(result.ok).toBe(true);

		if (result.ok) {
			expect(result.issuance).toEqual({
				asset: derived?.asset ?? "",
				assetAmountSats: 1000n,
				entropy: derived?.entropy ?? "",
				inflationAmountSats: 0n,
				inputId: "mint_in",
				kind: "new",
				outpoint: OUTPOINT,
				reissuanceToken: derived?.reissuanceToken ?? "",
			});
		}
	});

	test("with the amount taken from the request where the document names one", () => {
		const result = resolve({ asset_amount_sat: "params.supply", kind: "new" }, { supply: 21 });

		expect(result.ok ? result.issuance.assetAmountSats : 0n).toBe(21n);
	});

	test("and keeps a supply beyond a double's range exact", () => {
		const result = resolve(
			{ asset_amount_sat: "params.supply", kind: "new" },
			{ supply: "9007199254740993" },
		);

		expect(result.ok ? result.issuance.assetAmountSats : 0n).toBe(9_007_199_254_740_993n);
	});

	test("changing the output it derives from changes the asset", () => {
		const here = resolve({ asset_amount_sat: 1, kind: "new" });
		const there = resolveIssuance(
			{
				declared: { asset_amount_sat: 1, kind: "new" },
				id: "mint_in",
				outpoint: { ...OUTPOINT, vout: 3 },
			},
			{ params: {} },
		);

		expect(here.ok && there.ok && here.issuance.asset === there.issuance.asset).toBe(false);
	});
});

describe("what it will not mint, and says so rather than modelling", () => {
	test("a reissuance, because it has nothing to derive the asset from", () => {
		const result = resolve({ asset_amount_sat: 1000, kind: "reissue" });

		expect(result.ok).toBe(false);

		if (!result.ok) {
			expect(result.reject).toBe("unimplemented-construct");
			expect(result.reason).toContain("entropy");
			expect(result.reason).toContain("mint_in");
		}
	});

	test("a reissuance token, because it would have to be confidential to be spendable", () => {
		const result = resolve({ asset_amount_sat: 1000, inflation_amount_sat: 1, kind: "new" });

		expect(result.ok).toBe(false);

		if (!result.ok) {
			expect(result.reject).toBe("unimplemented-construct");
			expect(result.reason).toContain("confidential");
		}
	});

	test("but a stated zero of them is the ordinary case and is built", () => {
		expect(resolve({ asset_amount_sat: 1000, inflation_amount_sat: 0, kind: "new" }).ok).toBe(true);
	});

	test("an issuance of no units, which creates no asset", () => {
		const result = resolve({ asset_amount_sat: 0, kind: "new" });

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reject).toBe("document-fault");
	});

	test("a kind the format does not define", () => {
		const result = resolve({ asset_amount_sat: 1000, kind: "burn" });

		expect(result.ok).toBe(false);

		if (!result.ok) {
			expect(result.reject).toBe("document-fault");
			expect(result.reason).toContain('"burn"');
		}
	});

	test("an amount it cannot work out, rather than one nobody chose", () => {
		const result = resolve({ asset_amount_sat: "params.supply", kind: "new" });

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reject).toBe("document-fault");
	});

	test("and an outpoint that is not one", () => {
		const result = resolveIssuance(
			{
				declared: { asset_amount_sat: 1, kind: "new" },
				id: "mint_in",
				outpoint: { txid: "aabb", vout: 0 },
			},
			{ params: {} },
		);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.reason).toContain("aabb");
	});
});

describe("what an issuance says about itself, for a later name to read", () => {
	test("the asset it creates and the token that would reissue it", () => {
		const result = resolve({ asset_amount_sat: 1000, kind: "new" });

		expect(result.ok).toBe(true);

		if (result.ok) {
			expect(issuanceAttributes(result.issuance)).toEqual({
				asset: result.issuance.asset,
				reissuance_token: result.issuance.reissuanceToken,
			});
			expect(result.issuance.asset).not.toBe(PUBKEY);
		}
	});
});
