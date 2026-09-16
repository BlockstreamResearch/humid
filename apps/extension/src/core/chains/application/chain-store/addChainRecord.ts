import type { ChainGroup } from "../ChainGroup";
import type { ChainRecord } from "../ChainRecord";
import { getUnlockedChainStoreState, setUnlockedChainRecord } from "./secureChainStore";

type ChainGroupSource = Pick<ChainGroup, "chains" | "id">;

async function knownChainIds(chainGroups: readonly ChainGroupSource[]): Promise<Set<string>> {
	const store = await getUnlockedChainStoreState();
	const ids = new Set<string>();

	for (const group of chainGroups) {
		for (const chain of group.chains) ids.add(chain.id);
	}

	for (const id of Object.keys(store.chains)) ids.add(id);

	return ids;
}

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
