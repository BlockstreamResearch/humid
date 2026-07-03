import { getUnlockedChainStoreState } from "@/core/chains/application/chain-store/secureChainStore";
import { createLocalRootKeyManagerState } from "@/core/key-manager/state/local-root";
import { keyManagerStore } from "@/core/key-manager/storage/keyManagerStore";
import {
	createSecureVault,
	getSecureVaultStatus,
	getUnlockedSecureVaultStorage,
	getVaultLastActivityAt,
	initializeSecureVaultStorage,
	lockSecureVault,
	resetSecureVault,
	touchVaultActivity,
	unlockSecureVault,
} from "@/core/secure-vault/background";
import type { SecureVaultStatus } from "@/core/secure-vault/types";

import { getAutoLockMinutes } from "../auto-lock";
import type {
	WalletVaultCreateInput,
	WalletVaultStatus,
	WalletVaultUnlockInput,
} from "../model/types";

async function initializeStorage(): Promise<WalletVaultStatus> {
	const status = await initializeSecureVaultStorage();

	// The vault storage may have been restored from the session-cached data key (surviving an MV3
	// service-worker restart). If so, rehydrate the key-manager + chain state too; otherwise the
	// vault is genuinely locked. Fall back to locked if rehydration fails.
	if (status.isUnlocked) {
		try {
			const storage = getUnlockedSecureVaultStorage();

			await keyManagerStore.loadUnlockedState(storage);
			await getUnlockedChainStoreState(storage);

			return toWalletVaultStatus(status);
		} catch {
			clearUnlockedState();

			return toWalletVaultStatus(await lockSecureVault());
		}
	}

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

/**
 * Idle auto-lock: called periodically (MV3 alarm). Locks the vault once it has been unlocked but
 * unused for at least the configured timeout. A zero timeout disables it (lock only on browser
 * close or a manual lock). Returns whether it locked this time.
 */
async function enforceAutoLock(): Promise<boolean> {
	const minutes = await getAutoLockMinutes();

	if (minutes <= 0) return false;

	const status = await getSecureVaultStatus();

	if (!status.isUnlocked) return false;

	const lastActivityAt = await getVaultLastActivityAt();

	// No timestamp yet (freshly restored, or storage unsupported) → start the clock, don't lock.
	if (lastActivityAt === null) {
		await touchVaultActivity();

		return false;
	}

	if (Date.now() - lastActivityAt < minutes * 60_000) return false;

	await lock();

	return true;
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
	enforceAutoLock,
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
