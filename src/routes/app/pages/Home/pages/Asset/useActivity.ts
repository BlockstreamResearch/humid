import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import type {
	ActivityEntry,
	ActivityPage,
} from "@/core/accounts/application/accounts-rpc/model/types";
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

	const items = useMemo(
		() => (query.data?.pages ?? []).flatMap((page) => page.items.map(toActivity)),
		[query.data],
	);

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
		id: entry.txid,
	};
}
