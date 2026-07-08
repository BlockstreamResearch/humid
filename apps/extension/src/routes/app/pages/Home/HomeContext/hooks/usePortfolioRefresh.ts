import { useMutation, useQueryClient } from "@tanstack/react-query";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";

import { portfolioQueryKey } from "./usePortfolio";

/**
 * Manual portfolio refresh for the selected account+chain. Calls `accounts.refreshPortfolio`, which
 * force-syncs the background engine (bypassing its 60s throttle, still single-flighted), then writes
 * the fresh snapshot straight into the portfolio query cache so the balance and freshness label
 * update at once. `isRefreshing` is the in-flight flag the button uses to disable/spin itself so
 * mashing it can't queue extra scans (the engine also single-flights as a backstop).
 */
export function usePortfolioRefresh(keys: { accountGroupId: string; chainId: string }) {
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: () => accountsClient.refreshPortfolio(),
		onSuccess: (snapshot) => {
			queryClient.setQueryData(portfolioQueryKey(keys.accountGroupId, keys.chainId), snapshot);
		},
	});

	return {
		isRefreshing: mutation.isPending,
		refresh: mutation.mutate,
	};
}
