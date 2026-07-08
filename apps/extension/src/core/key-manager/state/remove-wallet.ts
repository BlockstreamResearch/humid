import { createAccountRegistry } from "@/core/accounts/application/account-registry";
import type { WalletId } from "@/core/accounts/application/account-registry/model/identifiers";

import type { KeyManagerState } from "../types";

export type RemoveWalletInput = {
	updatedAt?: number;
	walletId: WalletId;
};

/**
 * Removes a wallet from an unlocked key-manager state — the exact inverse of
 * `addImportedSeedToKeyManagerState`. It drops the wallet's key source + wallet record + every
 * account group (with their chain accounts and addresses) via the account registry, then DELETES the
 * wallet's secret material — the plaintext seed. That deletion is the whole point: an imported seed is
 * otherwise unremovable (the per-account "last group" guard blocks it), so its plaintext would persist
 * in the vault forever. `removeWallet` throws (aborting before the delete) if this is the last wallet.
 */
export function removeWalletFromKeyManagerState(
	state: KeyManagerState,
	input: RemoveWalletInput,
): KeyManagerState {
	const now = input.updatedAt ?? Date.now();
	const accountRegistry = createAccountRegistry();
	const { accountModel, keySourceId } = accountRegistry.removeWallet({
		accountModel: state.accountModel,
		updatedAt: now,
		walletId: input.walletId,
	});

	const secretMaterials = { ...state.secretMaterials };
	delete secretMaterials[keySourceId];

	return {
		...state,
		accountModel,
		secretMaterials,
		updatedAt: now,
	};
}
