import { useMutation, useQueryClient } from "@tanstack/react-query";

import { chainsClient } from "@/core/chains/application/chains-rpc/client";
import type {
	AddChainInput,
	ChainsState,
	RemoveChainInput,
	UpdateChainInput,
} from "@/core/chains/application/chains-rpc/model/types";
import { CHAINS_QUERY_KEY } from "@/routes/App/pages/Home/HomeContext/hooks/useChains";

/** Chain write actions (add / update / remove); each refreshes the shared chains cache. */
export function useChainActions() {
	const queryClient = useQueryClient();

	const onSuccess = (next: ChainsState) => {
		queryClient.setQueryData(CHAINS_QUERY_KEY, next);
	};

	return {
		updateChain: useMutation({
			mutationFn: (input: UpdateChainInput) => chainsClient.updateChain(input),
			onSuccess,
		}),
		addChain: useMutation({
			mutationFn: (input: AddChainInput) => chainsClient.addChain(input),
			onSuccess,
		}),
		removeChain: useMutation({
			mutationFn: (input: RemoveChainInput) => chainsClient.removeChain(input),
			onSuccess,
		}),
	};
}
