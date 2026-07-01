import type { LiquidChainId } from "./LiquidChain";

/** Display metadata for the Liquid native asset (the policy asset, L-BTC). */
export const LIQUID_NATIVE_ASSET = {
	decimals: 8,
	name: "Liquid Bitcoin",
	symbol: "L-BTC",
} as const;

export type LiquidAssetId = `${LiquidChainId}/elip144:${string}`;

export type ParsedLiquidAssetId = {
	assetId: LiquidAssetId;
	chainId: LiquidChainId;
	rawAssetId: string;
};
