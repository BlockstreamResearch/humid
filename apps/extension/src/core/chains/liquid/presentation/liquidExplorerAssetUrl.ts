import type { ChainRecord } from "@/core/chains/application/ChainRecord";

import type { LiquidChainRecord } from "../chains/LiquidChainRecord";

/**
 * "View on explorer" URL for a Liquid asset id: the chain's `explorerUrl` setting (an Esplora-style
 * base, e.g. `https://blockstream.info/liquidtestnet/`) + the `/asset/<assetId>` path every built-in
 * Liquid explorer uses. Null when the chain exposes no explorer URL. Mirrors `liquidExplorerTxUrl`
 * (same runtime narrowing, same trailing-slash trim): this lives in the Liquid layer because BOTH
 * the path convention and the settings shape are Liquid-specific, so generic routes reaching it via
 * `chainGroupUis` stay chain-neutral (no cast, no `/asset/` knowledge in the route).
 */
export function liquidExplorerAssetUrl(chain: ChainRecord, assetId: string): string | null {
	// Registered only under the Liquid group, so `chain` is a LiquidChainRecord at runtime — the same
	// runtime narrowing the group's other presentation parts rely on.
	const { explorerUrl } = (chain as LiquidChainRecord).settings;

	if (!explorerUrl) return null;

	return `${explorerUrl.replace(/\/+$/u, "")}/asset/${assetId}`;
}
