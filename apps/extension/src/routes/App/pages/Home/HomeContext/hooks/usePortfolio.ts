import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import type { PortfolioSnapshot } from "@/core/accounts/application/accounts-rpc/model/types";
import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";
import { parseBaseUnits } from "@/helpers/formatters";

/** Idle poll cadence for the open popup; the background scans on a throttle behind these reads. */
const PORTFOLIO_IDLE_POLL_MS = 20_000;

/** Faster poll while a background sync is in flight, so fresh data shows up quickly. */
const PORTFOLIO_ACTIVE_SYNC_POLL_MS = 2_000;

/** Query key for the selected account+chain portfolio; shared with the manual-refresh mutation. */
export const portfolioQueryKey = (accountGroupId: string, chainId: string) =>
	["portfolio", accountGroupId, chainId] as const;

/** The portfolio axis: the balance headline data and the token list (activity is fetched per asset). */
export type Portfolio = {
	error: string | null;
	isLoading: boolean;
	isSyncing: boolean;
	native: { amount: bigint; decimals: number; symbol: string } | null;
	/** When the background last successfully synced this account+chain (ms), or null before any sync. */
	syncedAt: number | null;
	tokens: PortfolioViewAsset[];
};

const EMPTY_PORTFOLIO: Portfolio = {
	error: null,
	isLoading: false,
	isSyncing: false,
	native: null,
	syncedAt: null,
	tokens: [],
};

/**
 * The portfolio axis for the selected account on the selected chain. The background keeps a
 * cached balance per account+chain and (re)syncs the wallet in a worker; these reads return
 * that cache instantly and carry its live `isSyncing`/`error` state. We poll faster while a
 * sync is in flight so fresh data lands quickly, then settle to the idle cadence. The token list
 * covers every asset the wallet holds; activity is fetched per asset on demand elsewhere. Keyed
 * by account + chain so it re-reads when either changes.
 */
export function usePortfolio(keys: { accountGroupId: string; chainId: string }): Portfolio {
	const query = useQuery({
		queryFn: () => accountsClient.getPortfolio(),
		queryKey: portfolioQueryKey(keys.accountGroupId, keys.chainId),
		refetchInterval: (portfolioQuery) =>
			portfolioQuery.state.data?.isSyncing ? PORTFOLIO_ACTIVE_SYNC_POLL_MS : PORTFOLIO_IDLE_POLL_MS,
	});

	return useMemo(() => toPortfolio(query.data, query.isPending), [query.data, query.isPending]);
}

/**
 * Maps the backend snapshot to the display portfolio. Amounts stay RAW (bigint base units) — the
 * originals used for crypto/transfer math; the presentation formats them at render.
 */
function toPortfolio(snapshot: PortfolioSnapshot | undefined, isPending: boolean): Portfolio {
	// No response yet (first read on a cold background): empty, and treated as syncing.
	if (!snapshot) return { ...EMPTY_PORTFOLIO, isLoading: isPending, isSyncing: isPending };

	const { data, error, isSyncing, syncedAt } = snapshot;

	// Synced but no data yet, or a sync failed before any data was cached.
	if (!data) return { ...EMPTY_PORTFOLIO, error, isSyncing, syncedAt };

	const nativeAsset = data.assets.find((asset) => asset.isNative) ?? null;

	return {
		error,
		isLoading: false,
		isSyncing,
		syncedAt,
		native: nativeAsset
			? {
					amount: parseBaseUnits(nativeAsset.amountSats),
					decimals: nativeAsset.decimals,
					symbol: nativeAsset.symbol,
				}
			: null,
		tokens: data.assets.map((asset) => ({
			amount: parseBaseUnits(asset.amountSats),
			decimals: asset.decimals,
			id: asset.rawAssetId,
			metadata: asset.metadata,
			name: asset.name,
			symbol: asset.symbol,
		})),
	};
}
