import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";

export type SendableAsset = {
	amount: bigint;
	decimals: number;
	isNative: boolean;
	name: string;
	rawAssetId: string;
	symbol: string;
};

function isNativeMetadata(metadata: unknown): boolean {
	return (
		typeof metadata === "object" &&
		metadata !== null &&
		"isNative" in metadata &&
		(metadata as { isNative?: unknown }).isNative === true
	);
}

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
