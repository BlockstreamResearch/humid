import type { ChainRecord } from "@/core/chains/application/ChainRecord";

import type { LiquidChainRecord } from "../chains/LiquidChainRecord";

/**
 * "View on explorer" URL for a Liquid txid: the chain's `explorerUrl` setting (an Esplora-style base,
 * e.g. `https://blockstream.info/liquidtestnet/`) + the `/tx/<txid>` path every built-in Liquid
 * explorer uses. Null when the chain exposes no explorer URL. This lives in the Liquid layer because
 * BOTH the path convention and the settings shape are Liquid-specific; generic routes reach it via
 * `chainGroupUis`, so they stay chain-neutral (no cast, no `/tx/` knowledge in the route).
 */
export function liquidExplorerTxUrl(chain: ChainRecord, txid: string): string | null {
	// Registered only under the Liquid group, so `chain` is a LiquidChainRecord at runtime — the same
	// runtime narrowing the group's other presentation parts rely on.
	const { explorerUrl } = (chain as LiquidChainRecord).settings;

	if (!explorerUrl) return null;

	return `${explorerUrl.replace(/\/+$/u, "")}/tx/${txid}`;
}
