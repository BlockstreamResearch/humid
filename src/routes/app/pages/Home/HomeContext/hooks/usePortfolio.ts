import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import type { PortfolioSnapshot } from "@/core/accounts/application/accounts-rpc/model/types";
import { formatUnits, handleTimestamp, truncateMiddle } from "@/helpers/formatters";

/** Idle poll cadence for the open popup; the background scans on a throttle behind these reads. */
const PORTFOLIO_IDLE_POLL_MS = 20_000;

/** Faster poll while a background sync is in flight, so fresh data shows up quickly. */
const PORTFOLIO_ACTIVE_SYNC_POLL_MS = 2_000;

/** One asset row (native or issued) for the balance headline and token list. */
export type PortfolioToken = {
	amount: string;
	fiat: string;
	id: string;
	name: string;
	price: string;
	symbol: string;
};

/** One transaction in an asset's history. */
export type PortfolioActivity = {
	amount: string;
	counterparty: string;
	date: string;
	direction: string;
	fiat: string;
	id: string;
};

/** The portfolio axis: balance headline, token list, and per-asset activity (by id). */
export type Portfolio = {
	activity: Record<string, PortfolioActivity[]>;
	error: string | null;
	isLoading: boolean;
	isSyncing: boolean;
	native: { amount: string; symbol: string } | null;
	tokens: PortfolioToken[];
	totalFiat: string | null;
};

const EMPTY_PORTFOLIO: Portfolio = {
	activity: {},
	error: null,
	isLoading: false,
	isSyncing: false,
	native: null,
	tokens: [],
	totalFiat: null,
};

/**
 * The portfolio axis for the selected account on the selected chain. The background keeps a
 * cached balance per account+chain and (re)syncs the wallet in a worker; these reads return
 * that cache instantly and carry its live `isSyncing`/`error` state. We poll faster while a
 * sync is in flight so fresh data lands quickly, then settle to the idle cadence. Fiat prices
 * and issued-asset metadata have no source yet, so fiat fields stay empty and the token list
 * is native-only. Keyed by account + chain so it re-reads when either changes.
 */
export function usePortfolio(keys: { accountGroupId: string; chainId: string }): Portfolio {
	const query = useQuery({
		queryFn: () => accountsClient.getPortfolio(),
		queryKey: ["portfolio", keys.accountGroupId, keys.chainId],
		refetchInterval: (portfolioQuery) =>
			portfolioQuery.state.data?.isSyncing ? PORTFOLIO_ACTIVE_SYNC_POLL_MS : PORTFOLIO_IDLE_POLL_MS,
	});

	return useMemo(() => toPortfolio(query.data, query.isPending), [query.data, query.isPending]);
}

/** Maps the backend snapshot to the display portfolio; fiat is unavailable (no feed). */
function toPortfolio(snapshot: PortfolioSnapshot | undefined, isPending: boolean): Portfolio {
	// No response yet (first read on a cold background): empty, and treated as syncing.
	if (!snapshot) return { ...EMPTY_PORTFOLIO, isLoading: isPending, isSyncing: isPending };

	const { data, error, isSyncing } = snapshot;

	// Synced but no balance yet, or a sync failed before any data was cached.
	if (!data) return { ...EMPTY_PORTFOLIO, error, isSyncing };

	const { native } = data;
	const amount = formatUnits(native.amountSats, native.decimals);

	return {
		activity: {
			[native.rawAssetId]: data.activity.map((entry) => ({
				amount: formatUnits(entry.amountSats, native.decimals),
				counterparty: truncateMiddle(entry.txid),
				date: entry.timestamp ? handleTimestamp(entry.timestamp).format("MMM D, YYYY") : "Pending",
				direction: entry.direction,
				fiat: "",
				id: entry.txid,
			})),
		},
		error,
		isLoading: false,
		isSyncing,
		native: { amount, symbol: native.symbol },
		tokens: [
			{
				amount,
				fiat: "",
				id: native.rawAssetId,
				name: native.name,
				price: "",
				symbol: native.symbol,
			},
		],
		totalFiat: null,
	};
}
