import { useQuery } from "@tanstack/react-query";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";

export function useReceiveAddress(keys: { accountGroupId: string; chainId: string }) {
	return useQuery({
		queryFn: () => accountsClient.getReceiveAddress(),
		queryKey: ["receiveAddress", keys.accountGroupId, keys.chainId],
	});
}
