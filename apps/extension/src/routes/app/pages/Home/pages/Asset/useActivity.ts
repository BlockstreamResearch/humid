import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import type {
	ActivityEntry,
	ActivityPage,
} from "@/core/accounts/application/accounts-rpc/model/types";
import type { PendingTransfer } from "@/core/accounts/application/pending-transfers/pendingTransfersStore";
import { usePendingTransfers } from "@/core/accounts/application/pending-transfers/usePendingTransfers";
import type {
	PortfolioViewActivity,
	PortfolioViewActivityFeed,
	PortfolioViewAsset,
} from "@/core/chains/application/PortfolioView";
import { handleTimestamp, parseBaseUnits, truncateMiddle } from "@/helpers/formatters";

/**
 * One asset's activity history for the asset screen: an on-demand, cursor-paginated query,
 * decoupled from the portfolio balance poll. The background reads pages straight from the scan
 * worker's cached wollet (no scan), so this is cheap and never blocks balances. Amounts are
 * formatted with the asset's own decimals. Keyed by account + chain + asset so it re-reads on a
 * switch.
 *
 * `isSyncing` is the portfolio's live sync state: a scan warms the worker's wollet, so when a
 * scan settles we refetch — activity that came back empty against a cold wollet (e.g. opening the
 * asset before the first sync) then returns the real history.
 */
export function useActivity(
	token: PortfolioViewAsset,
	keys: { accountGroupId: string; chainId: string; isSyncing: boolean },
): PortfolioViewActivityFeed {
	const query = useInfiniteQuery({
		getNextPageParam: (lastPage: ActivityPage) => lastPage.nextCursor,
		initialPageParam: null as string | null,
		queryFn: ({ pageParam }): Promise<ActivityPage> =>
			accountsClient.getActivity({ cursor: pageParam, rawAssetId: token.id }),
		queryKey: ["activity", keys.accountGroupId, keys.chainId, token.id],
	});

	const { fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = query;

	const wasSyncing = useRef(keys.isSyncing);

	useEffect(() => {
		if (wasSyncing.current && !keys.isSyncing) void refetch();
		wasSyncing.current = keys.isSyncing;
	}, [keys.isSyncing, refetch]);

	const onLoadMore = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	const pending = usePendingTransfers(keys.accountGroupId, keys.chainId);

	// The synced history: every loaded page mapped to display rows (a mempool tx already arrives here
	// as "pending" via a null timestamp — see toActivity).
	const synced = useMemo(
		() => (query.data?.pages ?? []).flatMap((page) => page.items.map(toActivity)),
		[query.data],
	);

	// Txids the scan has already surfaced (mempool or confirmed), used to de-dupe the optimistic rows.
	const syncedTxids = useMemo(() => new Set(synced.map((item) => item.id)), [synced]);

	// Optimistic "Pending" rows for THIS asset that no loaded page carries yet — newest first, on top.
	// They bridge broadcast → first post-send scan; once the scan reports the tx it drops out here and
	// the synced row takes over, so a tx is never shown twice.
	const optimistic = useMemo(
		() =>
			pending.entries
				.filter((entry) => entry.rawAssetId === token.id && !syncedTxids.has(entry.txid))
				.map(toOptimisticActivity),
		[pending.entries, syncedTxids, token.id],
	);

	// Reconcile GC: once a scan reports a tx we tracked optimistically, drop it from the store so it
	// stops being merged. One per pass — each removal invalidates the store and re-runs this effect for
	// the next — which serializes the read-modify-writes and sidesteps a lost-update race between them.
	const { remove } = pending;
	useEffect(() => {
		const caught = pending.entries.find(
			(entry) => entry.rawAssetId === token.id && syncedTxids.has(entry.txid),
		);

		if (caught) remove(caught.txid);
	}, [pending.entries, remove, syncedTxids, token.id]);

	const items = useMemo(() => [...optimistic, ...synced], [optimistic, synced]);

	return {
		error: query.isError,
		hasMore: hasNextPage,
		isLoading: query.isPending,
		isLoadingMore: isFetchingNextPage,
		items,
		onLoadMore,
	};
}

/** Map one backend activity entry to a display row; the amount stays raw (formatted at render). */
function toActivity(entry: ActivityEntry): PortfolioViewActivity {
	return {
		amount: parseBaseUnits(entry.amountSats),
		counterparty: truncateMiddle(entry.txid),
		date: entry.timestamp ? handleTimestamp(entry.timestamp).format("MMM D, YYYY") : "Pending",
		direction: entry.direction,
		fee: parseBaseUnits(entry.feeSats),
		id: entry.txid,
		status: entry.timestamp === null ? "pending" : "confirmed",
	};
}

/**
 * Map one optimistic pending transfer (broadcast, not yet scanned) to a display row. Always a "sent"
 * row with an unknown fee and a "Pending" date; the amount stays raw (formatted at render), and the
 * full txid is the id so the reconcile can de-dupe it against the synced entry.
 */
function toOptimisticActivity(entry: PendingTransfer): PortfolioViewActivity {
	return {
		amount: parseBaseUnits(entry.amountSats),
		counterparty: truncateMiddle(entry.txid),
		date: "Pending",
		direction: "sent",
		fee: null,
		id: entry.txid,
		status: "pending",
	};
}
