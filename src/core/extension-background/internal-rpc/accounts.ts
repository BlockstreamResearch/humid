import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import { getSelectedAccountGroup } from "@/core/accounts/application/account-registry/operations/getSelectedAccountGroup";
import { accountsRpc } from "@/core/accounts/application/accounts-rpc/model/rpc";
import type {
	AccountsState,
	PortfolioSnapshot,
	ReceiveAddress,
	RenameAccountInput,
	RevealRecoveryPhraseInput,
	SetSelectedAccountInput,
} from "@/core/accounts/application/accounts-rpc/model/types";
import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";

import type { RequestHandlerMap } from "../transport";

function readAccountsState(model: AccountModelState): AccountsState {
	return {
		accountGroups: Object.values(model.accountGroups),
		selectedAccountGroupId: getSelectedAccountGroup(model).id,
	};
}

export type AccountsRuntimeDeps = {
	// Materialize + sync the selected account on the selected chain, then read its
	// native balance and activity. Chain-specific; wired by the background root.
	getPortfolio: () => Promise<PortfolioSnapshot>;
	// Materialize + derive the receive address for the selected account on the
	// selected chain. Chain-specific; wired by the background composition root.
	getReceiveAddress: () => Promise<ReceiveAddress>;
};

export function createAccountsInternalHandlers(deps: AccountsRuntimeDeps): RequestHandlerMap {
	return {
		[accountsRpc.methods.getState]: () =>
			readAccountsState(walletVaultBackground.keyManager.getState().accountModel),
		[accountsRpc.methods.setSelected]: async (message) => {
			const { accountGroupId } = message.data as SetSelectedAccountInput;
			const model = walletVaultBackground.keyManager.getState().accountModel;

			if (!model.accountGroups[accountGroupId]) {
				throw new Error(`Unknown account group: ${accountGroupId}`);
			}

			const next = await walletVaultBackground.keyManager.updateState((current) => ({
				...current,
				accountModel: { ...current.accountModel, selectedAccountGroupId: accountGroupId },
			}));

			return readAccountsState(next.accountModel);
		},
		[accountsRpc.methods.rename]: async (message) => {
			const { accountGroupId, name } = message.data as RenameAccountInput;
			const trimmed = name.trim();

			if (!trimmed) throw new Error("Account name cannot be empty.");

			const model = walletVaultBackground.keyManager.getState().accountModel;

			if (!model.accountGroups[accountGroupId]) {
				throw new Error(`Unknown account group: ${accountGroupId}`);
			}

			const now = Date.now();
			const next = await walletVaultBackground.keyManager.updateState((current) => ({
				...current,
				accountModel: {
					...current.accountModel,
					accountGroups: {
						...current.accountModel.accountGroups,
						[accountGroupId]: {
							...current.accountModel.accountGroups[accountGroupId],
							name: trimmed,
							updatedAt: now,
						},
					},
					updatedAt: now,
				},
			}));

			return readAccountsState(next.accountModel);
		},
		[accountsRpc.methods.revealRecoveryPhrase]: (message) => {
			const { accountGroupId } = message.data as RevealRecoveryPhraseInput;
			const state = walletVaultBackground.keyManager.getState();
			const group = state.accountModel.accountGroups[accountGroupId];

			if (!group) throw new Error(`Unknown account group: ${accountGroupId}`);

			const wallet = state.accountModel.wallets[group.walletId];
			const secret = wallet ? state.secretMaterials[wallet.keySourceId] : undefined;

			// The local-root seed stores the BIP-39 mnemonic as its value.
			if (!secret || (secret.kind !== "seed" && secret.kind !== "mnemonic")) {
				throw new Error("This account has no revealable recovery phrase.");
			}

			return { phrase: secret.value };
		},
		[accountsRpc.methods.getReceiveAddress]: () => deps.getReceiveAddress(),
		[accountsRpc.methods.getPortfolio]: () => deps.getPortfolio(),
	};
}
