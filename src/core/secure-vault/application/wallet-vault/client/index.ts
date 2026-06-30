import { requestBackground } from "@/core/extension-rpc";
import { authStore } from "@/store/auth";

import { walletVaultRpc } from "../model/rpc";
import type {
	WalletVaultCreateInput,
	WalletVaultStatus,
	WalletVaultUnlockInput,
} from "../model/types";

function create(input: WalletVaultCreateInput): Promise<WalletVaultStatus> {
	return requestWalletVault(walletVaultRpc.methods.create, input);
}

function unlock(input: WalletVaultUnlockInput): Promise<WalletVaultStatus> {
	return requestWalletVault(walletVaultRpc.methods.unlock, input);
}

function lock(): Promise<WalletVaultStatus> {
	return requestWalletVault(walletVaultRpc.methods.lock);
}

function reset(): Promise<WalletVaultStatus> {
	return requestWalletVault(walletVaultRpc.methods.reset);
}

async function requestWalletVault(method: string, data?: unknown): Promise<WalletVaultStatus> {
	const status = await requestBackground<WalletVaultStatus>(method, data);

	authStore.useAuthStore.getState().setVaultStatus({
		hasVault: status.hasVault,
		isUnlocked: status.isUnlocked,
	});

	return status;
}

export const walletVaultClient = {
	create,
	lock,
	reset,
	unlock,
};
