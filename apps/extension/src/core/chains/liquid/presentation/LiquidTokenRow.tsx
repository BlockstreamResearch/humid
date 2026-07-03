import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";
import { formatUnits } from "@/helpers/formatters";

import type { LiquidAssetMetadata } from "../domain/LiquidAsset";

/** Liquid token-list row content: the asset glyph, its symbol + name, and balance. */
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
			<p className="text-right font-mono text-sm">{formatUnits(token.amount, token.decimals)}</p>
		</>
	);
}
