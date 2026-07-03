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
};

export type LiquidAssetId = `${LiquidChainId}/elip144:${string}`;

export type ParsedLiquidAssetId = {
	assetId: LiquidAssetId;
	chainId: LiquidChainId;
	rawAssetId: string;
};

/**
 * A redacted asset-id sentinel returned in place of a real one when a read capability
 * is not granted. Well-formed (chain-scoped, all-zero raw id) so the dapp still gets a
 * shaped response, but it identifies no real asset.
 */
export function restrictedLiquidAssetId(chainId: LiquidChainId): LiquidAssetId {
	return `${chainId}/elip144:${"0".repeat(64)}`;
}
