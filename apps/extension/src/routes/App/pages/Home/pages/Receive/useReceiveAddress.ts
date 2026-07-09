import { useQuery } from "@tanstack/react-query";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";

/**
 * The receive address for the selected account on the selected chain. Keyed by both
 * so it re-derives when either changes; the background resolves the current selection.
 */
export function useReceiveAddress(keys: { accountGroupId: string; chainId: string }) {
	return useQuery({
		queryFn: () => accountsClient.getReceiveAddress(),
		queryKey: ["receiveAddress", keys.accountGroupId, keys.chainId],
	});
}
