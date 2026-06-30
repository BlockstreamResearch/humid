import { createSecureJsonStore } from "@/core/secure-vault/json-store/createSecureJsonStore";
import type { SecureVaultStorage } from "@/core/secure-vault/types";

import { isKeyManagerState } from "../state/guards";
import type { KeyManagerState } from "../types";

const KEY_MANAGER_STATE_STORAGE_KEY = "key-manager:state";

const keyManagerJsonStore = createSecureJsonStore<KeyManagerState>({
	key: KEY_MANAGER_STATE_STORAGE_KEY,
	parse: parseKeyManagerState,
});

let unlockedKeyManagerState: KeyManagerState | null = null;

async function loadUnlockedState(storage?: SecureVaultStorage): Promise<KeyManagerState> {
	const state = await keyManagerJsonStore.require(storage);

	unlockedKeyManagerState = state;

	return state;
}

async function setUnlockedState(
	state: KeyManagerState,
	storage?: SecureVaultStorage,
): Promise<KeyManagerState> {
	await keyManagerJsonStore.set(state, storage);
	unlockedKeyManagerState = state;

	return state;
}

function getUnlockedState(): KeyManagerState {
	if (!unlockedKeyManagerState) {
		throw new Error("Vault is locked");
	}

	return unlockedKeyManagerState;
}

function getCachedState(): KeyManagerState | null {
	return unlockedKeyManagerState;
}

async function updateUnlockedState(
	update: (state: KeyManagerState) => KeyManagerState,
): Promise<KeyManagerState> {
	const now = Date.now();
	const nextState = update(getUnlockedState());
	const updatedState: KeyManagerState = {
		...nextState,
		accountModel: {
			...nextState.accountModel,
			updatedAt: now,
		},
		updatedAt: now,
	};

	await keyManagerJsonStore.set(updatedState);
	unlockedKeyManagerState = updatedState;

	return updatedState;
}

function clearUnlockedState(): void {
	unlockedKeyManagerState = null;
}

export const keyManagerStore = {
	clearUnlockedState,
	getCachedState,
	getUnlockedState,
	loadUnlockedState,
	setUnlockedState,
	updateUnlockedState,
};

function parseKeyManagerState(value: unknown): KeyManagerState {
	if (!isKeyManagerState(value)) {
		throw new Error("Vault item does not match the HUMID key manager model.");
	}

	return value;
}
