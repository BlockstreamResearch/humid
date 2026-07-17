import type { LiquidChainId } from "./LiquidChain";

/** Display metadata for the Liquid native asset (the policy asset, L-BTC). */
export const LIQUID_NATIVE_ASSET = {
	decimals: 8,
	name: "Liquid Bitcoin",
	symbol: "L-BTC",
} as const;

/**
 * Chain-specific display metadata carried on each Liquid asset, read by the Liquid presentation
 * components (the agnostic asset-UI blob, mirroring a chain record's `settings`). Grows with the
 * bits a Liquid asset row/detail wants to show (issuer domain, registry-verified, …).
 */
export type LiquidAssetMetadata = {
	isNative: boolean;
	/** The issuer's domain from the asset registry (assets.blockstream.info), or null if none/unlisted. */
	issuerDomain: string | null;
	/** True when the asset resolved in the registry (or is the native policy asset) — an anti-scam signal. */
	verified: boolean;
};

export type LiquidAssetId = `${LiquidChainId}/elip144:${string}`;

export type ParsedLiquidAssetId = {
	assetId: LiquidAssetId;
	chainId: LiquidChainId;
	rawAssetId: string;
};
