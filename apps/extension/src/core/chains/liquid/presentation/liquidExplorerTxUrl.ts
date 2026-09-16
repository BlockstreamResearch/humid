import type { ChainRecord } from "@/core/chains/application/ChainRecord";

import type { LiquidChainRecord } from "../chains/LiquidChainRecord";

export function liquidExplorerTxUrl(chain: ChainRecord, txid: string): string | null {
	const { explorerUrl } = (chain as LiquidChainRecord).settings;

	if (!explorerUrl) return null;

	return `${explorerUrl.replace(/\/+$/u, "")}/tx/${txid}`;
}
