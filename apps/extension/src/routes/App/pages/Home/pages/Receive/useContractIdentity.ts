import { useQuery } from "@tanstack/react-query";

import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import { readLiquidContractIdentity } from "@/core/chains/liquid/contractIdentityClient";

import { contractIdentityQueryKey } from "./contractIdentityQueryKey";

/**
 * The address and key contract actions are signed with, for one account on one chain.
 *
 * Read on demand rather than with the page: the background loads the contract module to answer,
 * which is several megabytes, and most visits to Receive only want an address.
 *
 * Keyed by the chain as well as the account, because the address is rendered for one network —
 * `tex1…` on testnet and `ex1…` on mainnet are the same key written two ways. Kept forever under
 * the account alone, switching chains would serve the previous network's address out of the
 * cache, which is what somebody then funds a contract action from. The background still reads the
 * selected chain; what the chain is doing here is naming which answer this is.
 *
 * The key itself does not vary by network, so the two halves of the answer age differently — but
 * they arrive together and only one identity can be cached, so the shorter-lived half decides.
 */
export function useContractIdentity(keys: {
	accountGroupId: AccountGroupId;
	chainId: string;
	enabled: boolean;
}) {
	return useQuery({
		enabled: keys.enabled,
		queryFn: () => readLiquidContractIdentity(keys.accountGroupId),
		queryKey: contractIdentityQueryKey(keys.accountGroupId, keys.chainId),
		// The identity is a function of the account's key and the chain it is rendered for, and
		// changes under neither — so once read for a pair, it is read once.
		staleTime: Infinity,
	});
}
