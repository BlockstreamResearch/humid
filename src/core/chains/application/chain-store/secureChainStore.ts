import { createSecureJsonStore } from "@/core/secure-vault/json-store/createSecureJsonStore";
import type { SecureVaultStorage } from "@/core/secure-vault/types";

import type { ChainGroupId, ChainId, ChainRecord } from "../ChainRecord";
import {
	createEmptyChainStoreState,
	parseChainStoreState,
	type ChainStoreState,
} from "./ChainStoreState";

const CHAIN_STORE_STORAGE_KEY = "chains:store";

const chainJsonStore = createSecureJsonStore<ChainStoreState>({
	key: CHAIN_STORE_STORAGE_KEY,
	parse: parseChainStoreState,
});

export async function getUnlockedChainStoreState(
	storage?: SecureVaultStorage,
): Promise<ChainStoreState> {
	const state = await chainJsonStore.get(storage);

	if (state) {
		return state;
	}

	const initialState = createEmptyChainStoreState();
	await chainJsonStore.set(initialState, storage);

	return initialState;
}

export async function setUnlockedChainRecord(
	chain: ChainRecord,
	storage?: SecureVaultStorage,
): Promise<ChainStoreState> {
	return chainJsonStore.update((state) => {
		const currentState = state ?? createEmptyChainStoreState();

		return {
			...currentState,
			chains: {
				...currentState.chains,
				[chain.id]: chain,
			},
			updatedAt: Date.now(),
		};
	}, storage);
}

export async function getUnlockedChainRecord(
	chainId: ChainId,
	storage?: SecureVaultStorage,
): Promise<ChainRecord | null> {
	const state = await getUnlockedChainStoreState(storage);

	return state.chains[chainId] ?? null;
}

export async function setUnlockedSelectedChainId(
	chainGroupId: ChainGroupId,
	chainId: ChainId,
	storage?: SecureVaultStorage,
): Promise<ChainStoreState> {
	return chainJsonStore.update((state) => {
		const currentState = state ?? createEmptyChainStoreState();

		return {
			...currentState,
			selectedChainIds: {
				...currentState.selectedChainIds,
				[chainGroupId]: chainId,
			},
			updatedAt: Date.now(),
		};
	}, storage);
}
