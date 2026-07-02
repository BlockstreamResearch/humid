import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";

import type { LiquidAssetMetadata } from "../domain/LiquidAsset";

/** Liquid token-list row content: the asset glyph, its symbol + name, and balance + fiat. */
export function LiquidTokenRow({ token }: { token: PortfolioViewAsset }) {
	const metadata = token.metadata as LiquidAssetMetadata;

	return (
		<>
			<div
				data-native={metadata.isNative}
				className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
			>
				{token.symbol.charAt(0)}
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium">{token.symbol}</p>
				<p className="text-muted-foreground truncate text-xs">{token.name}</p>
			</div>
			<div className="text-right">
				<p className="font-mono text-sm">{token.amount}</p>
				<p className="text-muted-foreground text-xs">{token.fiat}</p>
			</div>
		</>
	);
}
