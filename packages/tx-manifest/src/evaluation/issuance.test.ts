import { describe, expect, test } from "bun:test";

import { deriveNewIssuance } from "../chain/issuance";
import { refusalOf } from "../review/reviewForTests";
import { declaredIssuance, issuanceAttributes, resolveIssuance } from "./issuance";

const OUTPOINT = { txid: "c".repeat(64), vout: 2 };
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

function resolve(
	declared: Record<string, unknown>,
	params: Record<string, unknown> = {},
	outpoint = OUTPOINT,
) {
	return resolveIssuance({ declared, id: "mint_in", outpoint }, { params });
}

describe("the issuance an input declares", () => {
	test("is found where the input declares one, and nowhere else", () => {
		expect(declaredIssuance({ issuance: { kind: "new" } })).toEqual({ kind: "new" });
		expect(declaredIssuance({ id: "funding_in" })).toBeUndefined();
	});
});

describe("what this wallet will mint", () => {
	test("a new asset, derived from the very output the input spends", () => {
		const derived = deriveNewIssuance(OUTPOINT);

		expect(resolve({ asset_amount_sat: 1000, kind: "new" })).toEqual({
			asset: derived?.asset ?? "",
			assetAmountSats: 1000n,
			entropy: derived?.entropy ?? "",
			inflationAmountSats: 0n,
			inputId: "mint_in",
			kind: "new",
			outpoint: OUTPOINT,
			reissuanceToken: derived?.reissuanceToken ?? "",
		});
	});

	test("with the amount taken from the request where the document names one", () => {
		const issued = resolve({ asset_amount_sat: "params.supply", kind: "new" }, { supply: 21 });

		expect(issued.assetAmountSats).toBe(21n);
	});

	test("and keeps a supply beyond a double's range exact", () => {
		const issued = resolve(
			{ asset_amount_sat: "params.supply", kind: "new" },
			{ supply: "9007199254740993" },
		);

		expect(issued.assetAmountSats).toBe(9_007_199_254_740_993n);
	});

	test("changing the output it derives from changes the asset", () => {
		const declared = { asset_amount_sat: 1, kind: "new" };

		expect(resolve(declared).asset).not.toBe(resolve(declared, {}, { ...OUTPOINT, vout: 3 }).asset);
	});
});

describe("what it will not mint, and says so rather than modelling", () => {
	test("a reissuance, because it has nothing to derive the asset from", () => {
		const refusal = refusalOf(() => resolve({ asset_amount_sat: 1000, kind: "reissue" }));

		expect(refusal.reject).toBe("unimplemented-construct");
		expect(refusal.reason).toContain("entropy");
		expect(refusal.reason).toContain("mint_in");
	});

	test("a reissuance token, because it would have to be confidential to be spendable", () => {
		const refusal = refusalOf(() =>
			resolve({ asset_amount_sat: 1000, inflation_amount_sat: 1, kind: "new" }),
		);

		expect(refusal.reject).toBe("unimplemented-construct");
		expect(refusal.reason).toContain("confidential");
	});

	test("but a stated zero of them is the ordinary case and is built", () => {
		resolve({ asset_amount_sat: 1000, inflation_amount_sat: 0, kind: "new" });
	});

	test("an issuance of no units, which creates no asset", () => {
		expect(refusalOf(() => resolve({ asset_amount_sat: 0, kind: "new" })).reject).toBe(
			"document-fault",
		);
	});

	test("a kind the format does not define", () => {
		const refusal = refusalOf(() => resolve({ asset_amount_sat: 1000, kind: "burn" }));

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain('"burn"');
	});

	test("an amount it cannot work out, rather than one nobody chose", () => {
		expect(
			refusalOf(() => resolve({ asset_amount_sat: "params.supply", kind: "new" })).reject,
		).toBe("document-fault");
	});

	test("and an outpoint that is not one", () => {
		const refusal = refusalOf(() =>
			resolve({ asset_amount_sat: 1, kind: "new" }, {}, { txid: "aabb", vout: 0 }),
		);

		expect(refusal.reason).toContain("aabb");
	});
});

describe("what an issuance says about itself, for a later name to read", () => {
	test("the asset it creates and its reissuance token", () => {
		const issued = resolve({ asset_amount_sat: 1000, kind: "new" });

		expect(issuanceAttributes(issued)).toEqual({
			asset: issued.asset,
			reissuance_token: issued.reissuanceToken,
		});
		expect(issued.asset).not.toBe(PUBKEY);
	});
});
