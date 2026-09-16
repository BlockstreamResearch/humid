import { useQuery } from "@tanstack/react-query";

import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import { readLiquidContractIdentity } from "@/core/chains/liquid/contractIdentityClient";

import { contractIdentityQueryKey } from "./contractIdentityQueryKey";

export function useContractIdentity(keys: {
	accountGroupId: AccountGroupId;
	chainId: string;
	enabled: boolean;
}) {
	return useQuery({
		enabled: keys.enabled,
		queryFn: () => readLiquidContractIdentity(keys.accountGroupId),
		queryKey: contractIdentityQueryKey(keys.accountGroupId, keys.chainId),
		staleTime: Infinity,
	});
}
