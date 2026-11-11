import { describe, expect, test } from "bun:test";

import { deriveNewIssuance } from "../chain/issuance";
import { refusalOf } from "../review/reviewForTests";
import { declaredIssuance, issuanceAttributes, resolveIssuance } from "./issuance";

const OUTPOINT = { txid: "c".repeat(64), vout: 2 };
const PUBKEY = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const YES_ENTROPY = "f8326827828ee2aab3c4d273fb573a8cf89a401bbc6643637d439ff36c60b6b9";
const YES_ASSET = "3a8b6b466346d9dbfcecd8c8d7b0c1873aee4e00fd5df0d95086a3f7eecd5a39";
const reversed = (hex: string) => (hex.match(/../g) ?? []).toReversed().join("");

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

describe("reissuance tokens", () => {
	test("are minted alongside the asset", () => {
		expect(
			resolve({ asset_amount_sat: 1000, inflation_amount_sat: 1, kind: "new" }).inflationAmountSats,
		).toBe(1n);
	});

	test("are minted on their own, with no units of the asset", () => {
		expect(resolve({ asset_amount_sat: 0, inflation_amount_sat: 1, kind: "new" })).toMatchObject({
			assetAmountSats: 0n,
			inflationAmountSats: 1n,
		});
	});
});

describe("a reissuance", () => {
	const reissue = (declared: Record<string, unknown>, params: Record<string, unknown> = {}) =>
		resolve(
			{ asset_amount_sat: 50, entropy: "params.entropy", kind: "reissue", ...declared },
			{
				entropy: YES_ENTROPY,
				...params,
			},
		);

	test("mints more of the asset its entropy derives", () => {
		expect(reissue({ issued_asset: YES_ASSET })).toMatchObject({
			asset: YES_ASSET,
			assetAmountSats: 50n,
			entropy: YES_ENTROPY,
			inflationAmountSats: 0n,
			kind: "reissue",
		});
	});

	test("refuses an issued_asset its entropy does not derive, such as one copied byte-reversed", () => {
		const refusal = refusalOf(() =>
			reissue({ issued_asset: YES_ASSET }, { entropy: reversed(YES_ENTROPY) }),
		);

		expect(refusal.reject).toBe("document-fault");
		expect(refusal.reason).toContain("byte-reversed");
	});

	test("refuses one that names no entropy", () => {
		expect(refusalOf(() => reissue({ entropy: undefined })).reason).toContain("mint_in");
	});

	test("refuses one of no units", () => {
		expect(refusalOf(() => reissue({ asset_amount_sat: 0 })).reject).toBe("document-fault");
	});
});

describe("what it will not mint", () => {
	test("an issuance of no units and no tokens, which creates nothing", () => {
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
			issuance_entropy: issued.entropy,
			issued_asset: issued.asset,
			reissuance_token: issued.reissuanceToken,
		});
		expect(issued.asset).not.toBe(PUBKEY);
	});
});
