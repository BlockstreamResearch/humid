import { useQuery } from "@tanstack/react-query";

import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import { readLiquidContractIdentity } from "@/core/chains/liquid/contractIdentityClient";

/**
 * The address and key contract actions are signed with, for one account.
 *
 * Read on demand rather than with the page: the background loads the contract module to
 * answer, which is several megabytes, and most visits to Receive only want an address.
 */
export function useContractIdentity(keys: { accountGroupId: AccountGroupId; enabled: boolean }) {
	return useQuery({
		enabled: keys.enabled,
		queryFn: () => readLiquidContractIdentity(keys.accountGroupId),
		queryKey: ["contractIdentity", keys.accountGroupId],
		// The identity is a function of the account's key and never changes under it.
		staleTime: Infinity,
	});
}
