import { useMutation, useQueryClient } from "@tanstack/react-query";

import { chainsClient } from "@/core/chains/application/chains-rpc/client";
import type { UpdateChainInput } from "@/core/chains/application/chains-rpc/model/types";
import { CHAINS_QUERY_KEY } from "@/routes/App/pages/Home/HomeContext/hooks/useChains";

/** Chain write actions (persist a chain's settings); refreshes the shared chains cache. */
export function useChainActions() {
	const queryClient = useQueryClient();

	return {
		updateChain: useMutation({
			mutationFn: (input: UpdateChainInput) => chainsClient.updateChain(input),
			onSuccess: (next) => {
				queryClient.setQueryData(CHAINS_QUERY_KEY, next);
			},
		}),
	};
}
