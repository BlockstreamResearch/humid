import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";

/**
 * One asset the selected account can send, flattened from the Home portfolio for the Send form.
 * `amount` stays a raw bigint base-unit balance (formatted only at render); `rawAssetId` is the raw
 * hex id passed to the send RPC. The native policy asset (L-BTC) is flagged so it sorts first.
 */
export type SendableAsset = {
	amount: bigint;
	decimals: number;
	isNative: boolean;
	name: string;
	rawAssetId: string;
	symbol: string;
};

/**
 * Read the chain-agnostic `isNative` flag off an asset's opaque `metadata` blob without reaching into
 * a specific chain group's metadata type — keeps this route chain-neutral (the Liquid presentation
 * owns the concrete shape). Anything that isn't an object with `isNative === true` reads as false.
 */
function isNativeMetadata(metadata: unknown): boolean {
	return (
		typeof metadata === "object" &&
		metadata !== null &&
		"isNative" in metadata &&
		(metadata as { isNative?: unknown }).isNative === true
	);
}

/** Flatten the Home portfolio's assets into the Send form's asset list, native (L-BTC) first. */
export function toSendableAssets(tokens: PortfolioViewAsset[]): SendableAsset[] {
	return tokens
		.map((token) => ({
			amount: token.amount,
			decimals: token.decimals,
			isNative: isNativeMetadata(token.metadata),
			name: token.name,
			rawAssetId: token.id,
			symbol: token.symbol,
		}))
		.toSorted((left, right) => Number(right.isNative) - Number(left.isNative));
}
