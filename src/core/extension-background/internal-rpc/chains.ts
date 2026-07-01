import {
	getUnlockedChainStoreState,
	setUnlockedChainRecord,
	setUnlockedSelectedChainId,
} from "@/core/chains/application/chain-store/secureChainStore";
import type { ChainGroup } from "@/core/chains/application/ChainGroup";
import type { ChainId, ChainRecord } from "@/core/chains/application/ChainRecord";
import { chainsRpc } from "@/core/chains/application/chains-rpc/model/rpc";
import type {
	ChainsState,
	SetSelectedChainInput,
	UpdateChainInput,
} from "@/core/chains/application/chains-rpc/model/types";

import type { RequestHandlerMap } from "../transport";

// Only the fields the handlers read — sidesteps the ChainGroup dispatcher's
// generic variance so a concrete LiquidChainGroup assigns cleanly.
type ChainGroupSource = Pick<ChainGroup, "chains" | "id">;

/**
 * The chain axis the popup reads: every group's built-in chains, overridden by any
 * stored custom chains, plus the selected chain id (defaulting to the first group's
 * first chain when nothing is stored yet).
 */
async function readChainsState(chainGroups: readonly ChainGroupSource[]): Promise<ChainsState> {
	const store = await getUnlockedChainStoreState();
	const byId = new Map<ChainId, ChainRecord>();

	for (const group of chainGroups) {
		for (const chain of group.chains) byId.set(chain.id, chain);
	}

	for (const chain of Object.values(store.chains)) byId.set(chain.id, chain);

	const firstGroup = chainGroups[0];
	const selectedChainId = store.selectedChainIds[firstGroup.id] ?? firstGroup.chains[0].id;

	return { chains: [...byId.values()], selectedChainId };
}

export function createChainsInternalHandlers(
	chainGroups: readonly ChainGroupSource[],
): RequestHandlerMap {
	return {
		[chainsRpc.methods.getState]: () => readChainsState(chainGroups),
		[chainsRpc.methods.setSelected]: async (message) => {
			const { chainId } = message.data as SetSelectedChainInput;
			const known = await readChainsState(chainGroups);
			const chain = known.chains.find((candidate) => candidate.id === chainId);

			if (!chain) throw new Error(`Unknown chain: ${chainId}`);

			await setUnlockedSelectedChainId(chain.chainGroupId, chainId);

			return readChainsState(chainGroups);
		},
		[chainsRpc.methods.updateChain]: async (message) => {
			const { chain } = message.data as UpdateChainInput;
			const known = await readChainsState(chainGroups);
			const existing = known.chains.find((candidate) => candidate.id === chain.id);

			if (!existing) throw new Error(`Unknown chain: ${chain.id}`);

			if (existing.chainGroupId !== chain.chainGroupId) {
				throw new Error(`Chain group mismatch for ${chain.id}.`);
			}

			await setUnlockedChainRecord(chain);

			return readChainsState(chainGroups);
		},
	};
}
