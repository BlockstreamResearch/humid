import { getUnlockedChainStoreState } from "@/core/chains/application/chain-store/secureChainStore";
import { createLocalRootKeyManagerState } from "@/core/key-manager/state/local-root";
import { keyManagerStore } from "@/core/key-manager/storage/keyManagerStore";
import {
	createSecureVault,
	getSecureVaultStatus,
	getUnlockedSecureVaultStorage,
	initializeSecureVaultStorage,
	lockSecureVault,
	resetSecureVault,
	unlockSecureVault,
} from "@/core/secure-vault/background";
import type { SecureVaultStatus } from "@/core/secure-vault/types";

import type {
	WalletVaultCreateInput,
	WalletVaultStatus,
	WalletVaultUnlockInput,
} from "../model/types";

async function initializeStorage(): Promise<WalletVaultStatus> {
	const status = await initializeSecureVaultStorage();
	clearUnlockedState();

	return toWalletVaultStatus(status);
}

async function create(input: WalletVaultCreateInput): Promise<WalletVaultStatus> {
	const seedMaterial = requireNonEmpty(input.seedMaterial, "Missing seed material");

	await createSecureVault({
		passphrase: input.passphrase,
	});

	try {
		const storage = getUnlockedSecureVaultStorage();
		const keyManagerState = createLocalRootKeyManagerState({
			createdAt: Date.now(),
			seedMaterial,
		});

		await keyManagerStore.setUnlockedState(keyManagerState, storage);
		await getUnlockedChainStoreState(storage);
	} catch (error) {
		clearUnlockedState();
		await resetSecureVault();

		throw error;
	}

	return getStatus();
}

async function unlock(input: WalletVaultUnlockInput): Promise<WalletVaultStatus> {
	await unlockSecureVault({
		passphrase: input.passphrase,
	});

	try {
		const storage = getUnlockedSecureVaultStorage();

		await keyManagerStore.loadUnlockedState(storage);
		await getUnlockedChainStoreState(storage);
	} catch (error) {
		clearUnlockedState();
		await lockSecureVault();

		throw error;
	}

	return getStatus();
}

async function lock(): Promise<WalletVaultStatus> {
	clearUnlockedState();

	const status = await lockSecureVault();

	return toWalletVaultStatus(status);
}

async function reset(): Promise<WalletVaultStatus> {
	clearUnlockedState();

	const status = await resetSecureVault();

	return toWalletVaultStatus(status);
}

async function getStatus(): Promise<WalletVaultStatus> {
	return toWalletVaultStatus(await getSecureVaultStatus());
}

function toWalletVaultStatus(status: SecureVaultStatus): WalletVaultStatus {
	const keyManagerState = keyManagerStore.getCachedState();

	return {
		...status,
		accountCount: keyManagerState
			? Object.keys(keyManagerState.accountModel.accountGroups).length
			: undefined,
		keyringCount: keyManagerState
			? Object.keys(keyManagerState.accountModel.keySources).length
			: undefined,
	};
}

function requireNonEmpty(value: string, message: string): string {
	if (!value) {
		throw new Error(message);
	}

	return value;
}

function clearUnlockedState(): void {
	keyManagerStore.clearUnlockedState();
}

export const walletVaultBackground = {
	create,
	getStatus,
	initializeStorage,
	keyManager: {
		getState: keyManagerStore.getUnlockedState,
		updateState: keyManagerStore.updateUnlockedState,
	},
	lock,
	reset,
	unlock,
};
