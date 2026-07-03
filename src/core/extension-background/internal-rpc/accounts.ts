import { createAccountRegistry } from "@/core/accounts/application/account-registry";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import { getSelectedAccountGroup } from "@/core/accounts/application/account-registry/operations/getSelectedAccountGroup";
import { accountsRpc } from "@/core/accounts/application/accounts-rpc/model/rpc";
import type {
	AccountsState,
	ActivityPage,
	CreateAccountInput,
	GetActivityInput,
	ImportAccountInput,
	PortfolioSnapshot,
	ReceiveAddress,
	RemoveAccountInput,
	RenameAccountInput,
	RevealRecoveryPhraseInput,
	SetSelectedAccountInput,
} from "@/core/accounts/application/accounts-rpc/model/types";
import { keyManagerSecretMaterial } from "@/core/key-manager/secret-material";
import { addImportedSeedToKeyManagerState } from "@/core/key-manager/state/import-seed";
import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";

import type { RequestHandlerMap } from "../transport";
import { emitWalletEvent } from "../wallet-events";

function readAccountsState(model: AccountModelState): AccountsState {
	return {
		accountGroups: Object.values(model.accountGroups),
		selectedAccountGroupId: getSelectedAccountGroup(model).id,
	};
}

export type AccountsRuntimeDeps = {
	// Read one page of an asset's activity for the selected account on the selected
	// chain. Chain-specific; wired by the background composition root.
	getActivity: (input: GetActivityInput) => Promise<ActivityPage>;
	// Materialize + sync the selected account on the selected chain, then read its
	// balances and fiat rate. Chain-specific; wired by the background root.
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

			// The active account changed in the wallet. Notify connected dapps; injected dapps re-query
			// their origin-scoped session so their primary account follows the wallet's selection when
			// it is within their authorized set (Model B).
			emitWalletEvent("accountsChanged");

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
		[accountsRpc.methods.createAccount]: async (message) => {
			const { name } = (message.data ?? {}) as CreateAccountInput;
			const accountRegistry = createAccountRegistry();

			const next = await walletVaultBackground.keyManager.updateState((current) => {
				const selectedGroup = getSelectedAccountGroup(current.accountModel);
				const { accountGroup, accountModel } = accountRegistry.createNextAccountGroup({
					accountModel: current.accountModel,
					name,
					walletId: selectedGroup.walletId,
				});

				return {
					...current,
					accountModel: { ...accountModel, selectedAccountGroupId: accountGroup.id },
				};
			});

			return readAccountsState(next.accountModel);
		},
		[accountsRpc.methods.importAccount]: async (message) => {
			const { mnemonic, name } = message.data as ImportAccountInput;

			if (!keyManagerSecretMaterial.isValidMnemonic(mnemonic)) {
				throw new Error("Invalid recovery phrase.");
			}

			const seedMaterial = keyManagerSecretMaterial.normalizeMnemonic(mnemonic);
			const next = await walletVaultBackground.keyManager.updateState((current) =>
				addImportedSeedToKeyManagerState(current, { name, seedMaterial }),
			);

			return readAccountsState(next.accountModel);
		},
		[accountsRpc.methods.removeAccount]: async (message) => {
			const { accountGroupId } = message.data as RemoveAccountInput;
			const accountRegistry = createAccountRegistry();

			const next = await walletVaultBackground.keyManager.updateState((current) => {
				const { accountModel } = accountRegistry.removeAccountGroup({
					accountGroupId,
					accountModel: current.accountModel,
				});

				return { ...current, accountModel };
			});

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
		[accountsRpc.methods.getActivity]: (message) =>
			deps.getActivity(message.data as GetActivityInput),
	};
}
