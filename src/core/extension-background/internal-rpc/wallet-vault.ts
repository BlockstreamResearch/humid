import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";
import { walletVaultRpc } from "@/core/secure-vault/application/wallet-vault/model/rpc";
import type { WalletVaultStatus } from "@/core/secure-vault/application/wallet-vault/model/types";
import { authStore } from "@/store/auth";

import type { RequestHandlerMap } from "../transport";

/**
 * Mirrors the wallet-vault status into the shared auth store. Exported so the
 * background can also sync the initial status on startup.
 */
export function syncWalletVaultAuthStore(status: WalletVaultStatus): WalletVaultStatus {
	authStore.useAuthStore.getState().setVaultStatus({
		hasVault: status.hasVault,
		isUnlocked: status.isUnlocked,
	});

	return status;
}

export const walletVaultInternalHandlers: RequestHandlerMap = {
	[walletVaultRpc.methods.create]: async (message) => {
		const status = await walletVaultBackground.create(
			message.data as Parameters<typeof walletVaultBackground.create>[0],
		);

		return syncWalletVaultAuthStore(status);
	},
	[walletVaultRpc.methods.unlock]: async (message) => {
		const status = await walletVaultBackground.unlock(
			message.data as Parameters<typeof walletVaultBackground.unlock>[0],
		);

		return syncWalletVaultAuthStore(status);
	},
	[walletVaultRpc.methods.lock]: async () => {
		return syncWalletVaultAuthStore(await walletVaultBackground.lock());
	},
	[walletVaultRpc.methods.reset]: async () => {
		return syncWalletVaultAuthStore(await walletVaultBackground.reset());
	},
};
