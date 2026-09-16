import { useMutation, useQueryClient } from "@tanstack/react-query";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";

import { portfolioQueryKey } from "./usePortfolio";

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
