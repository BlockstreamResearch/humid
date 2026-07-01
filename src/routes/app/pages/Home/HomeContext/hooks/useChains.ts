import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ChainId } from "@/core/chains/application/ChainRecord";
import { chainsClient } from "@/core/chains/application/chains-rpc/client";

export const CHAINS_QUERY_KEY = ["chains"] as const;

/** The chain axis: the available chains, the selected one, and a switch mutation. */
export function useChains() {
	const queryClient = useQueryClient();
	const query = useQuery({ queryFn: () => chainsClient.getState(), queryKey: CHAINS_QUERY_KEY });

	const selectChainMutation = useMutation({
		mutationFn: (chainId: ChainId) => chainsClient.setSelected({ chainId }),
		onSuccess: (next) => {
			queryClient.setQueryData(CHAINS_QUERY_KEY, next);
		},
	});

	const chains = query.data?.chains ?? [];
	const chain = chains.find((candidate) => candidate.id === query.data?.selectedChainId);

	return {
		chain,
		chains,
		isError: query.isError,
		isLoading: query.isPending,
		selectChain: selectChainMutation.mutate,
	};
}
