import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import type {
	ActivityEntry,
	ActivityPage,
	HeldTransaction,
} from "@/core/accounts/application/accounts-rpc/model/types";
import { usePendingTransfers } from "@/core/accounts/application/pending-transfers/usePendingTransfers";

const HELD_REFRESH_MS = 30_000;

export const accountActivityQueryKey = (accountGroupId: string, chainId: string) => [
	"activity",
	accountGroupId,
	chainId,
	"all",
];

export const heldTransactionsQueryKey = (accountGroupId: string, chainId: string) => [
	"held-transactions",
	accountGroupId,
	chainId,
];

export type AccountActivity = {
	error: boolean;
	hasMore: boolean;
	held: HeldTransaction[];
	isLoading: boolean;
	isLoadingMore: boolean;
	items: ActivityEntry[];
	onLoadMore: () => void;
	onRelease: (txid: string) => void;
	pending: ActivityEntry[];
	releasing: string | null;
};

export function useAccountActivity(keys: {
	accountGroupId: string;
	chainId: string;
	isSyncing: boolean;
}): AccountActivity {
	const queryClient = useQueryClient();
	const heldKey = heldTransactionsQueryKey(keys.accountGroupId, keys.chainId);
	const history = useInfiniteQuery({
		getNextPageParam: (lastPage: ActivityPage) => lastPage.nextCursor,
		initialPageParam: null as string | null,
		queryFn: ({ pageParam }) => accountsClient.getActivity({ cursor: pageParam, rawAssetId: null }),
		queryKey: accountActivityQueryKey(keys.accountGroupId, keys.chainId),
	});
	const held = useQuery({
		queryFn: accountsClient.listHeldTransactions,
		queryKey: heldKey,
		refetchInterval: HELD_REFRESH_MS,
	});
	const release = useMutation({
		mutationFn: accountsClient.releaseHeldTransaction,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: heldKey }),
	});
	const transfers = usePendingTransfers(keys.accountGroupId, keys.chainId);
	const wasSyncing = useRef(keys.isSyncing);
	const { refetch } = history;

	useEffect(() => {
		if (wasSyncing.current && !keys.isSyncing) void refetch();
		wasSyncing.current = keys.isSyncing;
	}, [keys.isSyncing, refetch]);

	const synced = useMemo(
		() => (history.data?.pages ?? []).flatMap((page) => page.items),
		[history.data],
	);
	const pending = useMemo(() => {
		const known = new Set(synced.map(({ txid }) => txid));
		const sending = transfers.entries
			.filter(({ txid }) => !known.has(txid))
			.map(
				({ amountSats, rawAssetId, txid }): ActivityEntry => ({
					changes: [{ amountSats: `-${amountSats}`, rawAssetId }],
					feeSats: "0",
					timestamp: null,
					txid,
				}),
			);

		return [...sending, ...synced.filter(({ timestamp }) => timestamp === null)];
	}, [synced, transfers.entries]);

	return {
		error: history.isError,
		hasMore: history.hasNextPage,
		held: held.data ?? [],
		isLoading: history.isPending,
		isLoadingMore: history.isFetchingNextPage,
		items: synced.filter(({ timestamp }) => timestamp !== null),
		onLoadMore: () => {
			if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage();
		},
		onRelease: release.mutate,
		pending,
		releasing: release.isPending ? release.variables : null,
	};
}
