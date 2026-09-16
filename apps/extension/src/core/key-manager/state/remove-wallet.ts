import { createAccountRegistry } from "@/core/accounts/application/account-registry";
import type { WalletId } from "@/core/accounts/application/account-registry/model/identifiers";

import type { KeyManagerState } from "../types";

export type RemoveWalletInput = {
	updatedAt?: number;
	walletId: WalletId;
};

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
