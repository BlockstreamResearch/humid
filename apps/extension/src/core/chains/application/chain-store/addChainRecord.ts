import type { ChainGroup } from "../ChainGroup";
import type { ChainRecord } from "../ChainRecord";
import { getUnlockedChainStoreState, setUnlockedChainRecord } from "./secureChainStore";

/** Only the fields the guard reads — sidesteps the ChainGroup dispatcher's generic variance. */
type ChainGroupSource = Pick<ChainGroup, "chains" | "id">;

/** Every id the wallet already knows: each group's built-in chains ∪ the stored custom chains. */
async function knownChainIds(chainGroups: readonly ChainGroupSource[]): Promise<Set<string>> {
	const store = await getUnlockedChainStoreState();
	const ids = new Set<string>();

	for (const group of chainGroups) {
		for (const chain of group.chains) ids.add(chain.id);
	}

	for (const id of Object.keys(store.chains)) ids.add(id);

	return ids;
}

/**
 * Persist a NEW chain record behind the same two guards the popup add-chain path enforces: the chain
 * must belong to a KNOWN chain group, and its id must not already exist (built-in or stored). Shared
 * so the dapp-facing `wallet_addChain` reuses the exact validation instead of forking it.
 */
export async function addUnlockedChainRecord(
	chain: ChainRecord,
	chainGroups: readonly ChainGroupSource[],
): Promise<void> {
	if (!chainGroups.some((group) => group.id === chain.chainGroupId)) {
		throw new Error(`Unknown chain group: ${chain.chainGroupId}`);
	}

	if ((await knownChainIds(chainGroups)).has(chain.id)) {
		throw new Error(`Chain already exists: ${chain.id}`);
	}

	await setUnlockedChainRecord(chain);
}
