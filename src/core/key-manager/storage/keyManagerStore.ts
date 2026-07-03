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

// Serialize writes: each update runs only after the previous one settles, so `update()` always sees
// the latest persisted state instead of a stale snapshot. Concurrent callers (e.g. materializing
// accounts across chains during a dapp connect) otherwise race this read-modify-write — both read the
// same state and the second `set()` clobbers the first, silently losing an update.
let writeQueue: Promise<unknown> = Promise.resolve();

async function updateUnlockedState(
	update: (state: KeyManagerState) => KeyManagerState,
): Promise<KeyManagerState> {
	const run = writeQueue.then(async () => {
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
	});

	// Keep the queue alive if this update throws (a failure must not wedge later writes) while still
	// surfacing the rejection to this caller.
	writeQueue = run.catch(() => undefined);

	return run;
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
