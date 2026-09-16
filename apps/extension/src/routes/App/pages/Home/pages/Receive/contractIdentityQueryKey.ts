import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";

export function contractIdentityQueryKey(
	accountGroupId: AccountGroupId,
	chainId: string,
): [string, AccountGroupId, string] {
	return ["contractIdentity", accountGroupId, chainId];
}
