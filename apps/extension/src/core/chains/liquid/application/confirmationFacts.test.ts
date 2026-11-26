import { describe, expect, test } from "bun:test";

import { readKnownAssets } from "./confirmationFacts";

const POLICY = "aa".repeat(32);
const LISTED = "bb".repeat(32);
const UNLISTED = "cc".repeat(32);

const asset = (rawAssetId: string, verified: boolean) => ({
	decimals: verified ? 2 : 0,
	metadata: { isNative: false, issuerDomain: null, verified },
	rawAssetId,
	symbol: verified ? "USDt" : "cccc…cccc",
});

describe("the assets a confirmation can name", () => {
	test("leave out an asset the registry does not list, so it reads as unknown, in raw units", async () => {
		const known = await readKnownAssets(
			{
				readPortfolioSnapshot: async () =>
					({ data: { assets: [asset(LISTED, true), asset(UNLISTED, false)] } }) as never,
			},
			{ accountGroupId: "account-group:1", chainId: "liquid", rawPolicyAssetId: POLICY } as never,
		);

		expect(Object.keys(known).toSorted()).toEqual([POLICY, LISTED].toSorted());
		expect(known[LISTED]).toEqual({ decimals: 2, ticker: "USDt" });
	});
});
