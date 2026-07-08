import {
	getUnlockedChainStoreState,
	removeUnlockedChainRecord,
	setUnlockedChainRecord,
	setUnlockedSelectedChainId,
} from "@/core/chains/application/chain-store/secureChainStore";
import type { ChainGroup } from "@/core/chains/application/ChainGroup";
import type { ChainId, ChainRecord } from "@/core/chains/application/ChainRecord";
import { chainsRpc } from "@/core/chains/application/chains-rpc/model/rpc";
import type {
	AddChainInput,
	ChainsState,
	RemoveChainInput,
	SetSelectedChainInput,
	UpdateChainInput,
} from "@/core/chains/application/chains-rpc/model/types";
import { LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT } from "@/core/chains/liquid/domain/LiquidRpc";

import type { RequestHandlerMap } from "../transport";
import { emitWalletEvent } from "../wallet-events";

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

			// The wallet's active chain changed — notify connected dapps (MetaMask-style chainChanged).
			emitWalletEvent("chainChanged", { chainId });
			// The selected chain determines the descriptor's policy asset, so the connected account's
			// descriptor changed too (ELIP-1) — a dapp re-queries getWalletDescriptor for its own view.
			emitWalletEvent(LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT, { chainId });

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
		[chainsRpc.methods.addChain]: async (message) => {
			const { chain } = message.data as AddChainInput;

			if (!chainGroups.some((group) => group.id === chain.chainGroupId)) {
				throw new Error(`Unknown chain group: ${chain.chainGroupId}`);
			}

			const known = await readChainsState(chainGroups);

			if (known.chains.some((candidate) => candidate.id === chain.id)) {
				throw new Error(`Chain already exists: ${chain.id}`);
			}

			await setUnlockedChainRecord(chain);

			return readChainsState(chainGroups);
		},
		[chainsRpc.methods.removeChain]: async (message) => {
			const { chainId } = message.data as RemoveChainInput;

			// Built-in chains live in a group's static list — they cannot be removed.
			const isBuiltIn = chainGroups.some((group) =>
				group.chains.some((candidate) => candidate.id === chainId),
			);

			if (isBuiltIn) throw new Error(`Built-in chains cannot be removed: ${chainId}`);

			const store = await getUnlockedChainStoreState();
			const removed = store.chains[chainId];

			if (!removed) throw new Error(`Unknown chain: ${chainId}`);

			await removeUnlockedChainRecord(chainId);

			// If the removed chain was selected for its group, fall back to a built-in.
			if (store.selectedChainIds[removed.chainGroupId] === chainId) {
				const group = chainGroups.find((candidate) => candidate.id === removed.chainGroupId);
				if (group) await setUnlockedSelectedChainId(group.id, group.chains[0].id);
			}

			return readChainsState(chainGroups);
		},
	};
}
