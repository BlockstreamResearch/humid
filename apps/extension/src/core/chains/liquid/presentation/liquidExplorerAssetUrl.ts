import type { ChainRecord } from "@/core/chains/application/ChainRecord";

import type { LiquidChainRecord } from "../chains/LiquidChainRecord";

export function liquidExplorerAssetUrl(chain: ChainRecord, assetId: string): string | null {
	const { explorerUrl } = (chain as LiquidChainRecord).settings;

	if (!explorerUrl) return null;

	return `${explorerUrl.replace(/\/+$/u, "")}/asset/${assetId}`;
}
