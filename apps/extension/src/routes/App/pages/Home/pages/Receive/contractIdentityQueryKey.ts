import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";

/**
 * What the contract identity is cached under.
 *
 * A module of its own rather than a literal inside the hook, so the cache's identity is something
 * that can be asserted about. There is no hook-test harness in this project — no renderer and no
 * query client in a test — and the hook itself reaches the background through
 * `webextension-polyfill`, which throws outside an extension. So a key written inline is a
 * decision nothing could hold to.
 *
 * It is worth holding to. The answer is kept forever, because it is a function of a key that does
 * not change; the address half of it, though, is rendered for one network — `tex1…` on testnet
 * and `ex1…` on mainnet are the same key written two ways. Cached under the account alone,
 * switching chains serves the previous network's address out of the cache, and that address is
 * what somebody then funds a contract action from.
 */
export function contractIdentityQueryKey(
	accountGroupId: AccountGroupId,
	chainId: string,
): [string, AccountGroupId, string] {
	return ["contractIdentity", accountGroupId, chainId];
}
