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

	const synced = useMemo(
		() => (query.data?.pages ?? []).flatMap((page) => page.items.map(toActivity)),
		[query.data],
	);

	const syncedTxids = useMemo(() => new Set(synced.map((item) => item.id)), [synced]);

	const optimistic = useMemo(
		() =>
			pending.entries
				.filter((entry) => entry.rawAssetId === token.id && !syncedTxids.has(entry.txid))
				.map(toOptimisticActivity),
		[pending.entries, syncedTxids, token.id],
	);

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

function toActivity(entry: ActivityEntry): PortfolioViewActivity {
	return {
		amount: parseBaseUnits(entry.amountSats),
		counterparty: truncateMiddle(entry.txid),
		date: entry.timestamp ? handleTimestamp(entry.timestamp).format("MMM D, YYYY") : "Pending",
		direction: entry.direction,
		fee: parseBaseUnits(entry.feeSats),
		id: entry.txid,
		status: entry.timestamp === null ? "pending" : "confirmed",
		timestamp: entry.timestamp,
	};
}

function toOptimisticActivity(entry: PendingTransfer): PortfolioViewActivity {
	return {
		amount: parseBaseUnits(entry.amountSats),
		counterparty: truncateMiddle(entry.txid),
		date: "Pending",
		direction: "sent",
		fee: null,
		id: entry.txid,
		status: "pending",
		timestamp: null,
	};
}
