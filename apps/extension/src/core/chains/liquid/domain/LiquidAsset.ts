import type { LiquidChainId } from "./LiquidChain";

export const LIQUID_NATIVE_ASSET = {
	decimals: 8,
	name: "Liquid Bitcoin",
	symbol: "L-BTC",
} as const;

export type LiquidAssetMetadata = {
	isNative: boolean;
	issuerDomain: string | null;
	verified: boolean;
};

export type LiquidAssetId = `${LiquidChainId}/elip144:${string}`;

export type ParsedLiquidAssetId = {
	assetId: LiquidAssetId;
	chainId: LiquidChainId;
	rawAssetId: string;
};
