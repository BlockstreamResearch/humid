import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import type { PortfolioSnapshot } from "@/core/accounts/application/accounts-rpc/model/types";
import type {
	PortfolioViewActivity,
	PortfolioViewAsset,
} from "@/core/chains/application/PortfolioView";
import { formatUnits, handleTimestamp, truncateMiddle } from "@/helpers/formatters";

/** Idle poll cadence for the open popup; the background scans on a throttle behind these reads. */
const PORTFOLIO_IDLE_POLL_MS = 20_000;

/** Faster poll while a background sync is in flight, so fresh data shows up quickly. */
const PORTFOLIO_ACTIVE_SYNC_POLL_MS = 2_000;

/** The portfolio axis: balance headline, token list, and per-asset activity (by id). */
export type Portfolio = {
	activity: Record<string, PortfolioViewActivity[]>;
	error: string | null;
	isLoading: boolean;
	isSyncing: boolean;
	native: { amount: string; symbol: string } | null;
	tokens: PortfolioViewAsset[];
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
 * sync is in flight so fresh data lands quickly, then settle to the idle cadence. The token
 * list covers every asset the wallet holds; issued-asset names and fiat land in later passes,
 * so for now issued assets show placeholder labels and fiat stays empty. Keyed by account +
 * chain so it re-reads when either changes.
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

	// Synced but no data yet, or a sync failed before any data was cached.
	if (!data) return { ...EMPTY_PORTFOLIO, error, isSyncing };

	const decimalsByAsset = new Map(data.assets.map((asset) => [asset.rawAssetId, asset.decimals]));
	const nativeAsset = data.assets.find((asset) => asset.isNative) ?? null;

	const fiatRate = data.rate;
	const nativeUnitPrice =
		fiatRate && Number(fiatRate.nativeUnitPrice) > 0 ? Number(fiatRate.nativeUnitPrice) : null;

	// Format a native-asset amount in fiat (empty when there's no rate). Only the native asset is
	// priced — issued assets have no direct exchange rate.
	const fiatFor = (units: string): string => {
		if (!fiatRate || nativeUnitPrice === null) return "";

		return new Intl.NumberFormat("en-US", {
			currency: fiatRate.currency,
			style: "currency",
		}).format(Number(units) * nativeUnitPrice);
	};

	// A tx can touch several assets (e.g. a swap), so split each into a per-asset entry keyed
	// by asset id — the Asset screen then shows just that asset's history.
	const activity: Record<string, PortfolioViewActivity[]> = {};

	for (const tx of data.activity) {
		for (const delta of tx.deltas) {
			const sats = BigInt(delta.amountSats);
			const magnitude = sats < 0n ? -sats : sats;

			(activity[delta.rawAssetId] ??= []).push({
				amount: formatUnits(magnitude.toString(), decimalsByAsset.get(delta.rawAssetId) ?? 8),
				counterparty: truncateMiddle(tx.txid),
				date: tx.timestamp ? handleTimestamp(tx.timestamp).format("MMM D, YYYY") : "Pending",
				direction: sats < 0n ? "sent" : "received",
				fiat: "",
				id: tx.txid,
			});
		}
	}

	return {
		activity,
		error,
		isLoading: false,
		isSyncing,
		native: nativeAsset
			? {
					amount: formatUnits(nativeAsset.amountSats, nativeAsset.decimals),
					symbol: nativeAsset.symbol,
				}
			: null,
		tokens: data.assets.map((asset) => {
			const amount = formatUnits(asset.amountSats, asset.decimals);

			return {
				amount,
				fiat: asset.isNative ? fiatFor(amount) : "",
				id: asset.rawAssetId,
				metadata: asset.metadata,
				name: asset.name,
				price: asset.isNative ? fiatFor("1") : "",
				symbol: asset.symbol,
			};
		}),
		totalFiat: nativeAsset
			? fiatFor(formatUnits(nativeAsset.amountSats, nativeAsset.decimals)) || null
			: null,
	};
}
