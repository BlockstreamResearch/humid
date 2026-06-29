import { requestBackground } from "@/core/extension-rpc";
import { authStore } from "@/store/auth";

import type { VaultCreateInput, VaultStatus, VaultUnlockInput } from "./types";

export { generateSecret, generateSeedMaterial } from "./secrets";
export type { VaultCreateInput, VaultStatus, VaultUnlockInput } from "./types";

export function createVault(input: VaultCreateInput): Promise<VaultStatus> {
	return requestVault("vault.create", input);
}

export function unlockVault(input: VaultUnlockInput): Promise<VaultStatus> {
	return requestVault("vault.unlock", input);
}

export function lockVault(): Promise<VaultStatus> {
	return requestVault("vault.lock");
}

export function resetVault(): Promise<VaultStatus> {
	return requestVault("vault.reset");
}

async function requestVault(method: string, data?: unknown): Promise<VaultStatus> {
	const status = await requestBackground<VaultStatus>(method, data);

	authStore.useAuthStore.getState().setVaultStatus({
		hasVault: status.hasVault,
		isUnlocked: status.isUnlocked,
	});

	return status;
}
