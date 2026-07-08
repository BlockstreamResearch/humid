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
	RemoveWalletInput,
	RenameAccountInput,
	RevealRecoveryPhraseInput,
	SetSelectedAccountInput,
} from "@/core/accounts/application/accounts-rpc/model/types";
import { LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT } from "@/core/chains/liquid/domain/LiquidRpc";
import { keyManagerSecretMaterial } from "@/core/key-manager/secret-material";
import { addImportedSeedToKeyManagerState } from "@/core/key-manager/state/import-seed";
import { removeWalletFromKeyManagerState } from "@/core/key-manager/state/remove-wallet";
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
	// Force an immediate re-sync of the selected account's portfolio (bypasses the
	// engine throttle, single-flighted) and return the fresh snapshot. Wired by the root.
	refreshPortfolio: () => Promise<PortfolioSnapshot>;
	// Garbage-collect a removed account's persisted portfolio (session-storage
	// snapshots + cached scan target). Best-effort; wired by the background root.
	purgeAccountPortfolio: (accountGroupId: string) => Promise<void>;
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
			// The connected account's descriptor set / account id / policy asset changed too (ELIP-1) — a
			// dapp re-queries getWalletDescriptor for its own view.
			emitWalletEvent(LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT);

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

			// A new account was created and selected: the connected account changed, and so did its
			// descriptor (new account id / descriptor set / policy asset — ELIP-1).
			emitWalletEvent("accountsChanged");
			emitWalletEvent(LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT);

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

			// The imported account becomes selected: notify connected dapps of the account change and its
			// descriptor change (new account id / descriptor set / policy asset — ELIP-1).
			emitWalletEvent("accountsChanged");
			emitWalletEvent(LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT);

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

			// Removal committed (a guarded removal — e.g. the wallet's only account — throws inside
			// `removeAccountGroup` above, short-circuiting before this). GC the removed account's
			// persisted portfolio; best-effort (the stores swallow their own storage errors), so a
			// storage failure can never undo a removal that already succeeded.
			await deps.purgeAccountPortfolio(accountGroupId);

			// Removal reassigned the selected account group: the connected account changed, and so did its
			// descriptor (new account id / descriptor set / policy asset — ELIP-1).
			emitWalletEvent("accountsChanged");
			emitWalletEvent(LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT);

			return readAccountsState(next.accountModel);
		},
		[accountsRpc.methods.removeWallet]: async (message) => {
			const { walletId } = message.data as RemoveWalletInput;

			// Capture the wallet's account groups BEFORE the state update: the op deletes the wallet
			// record, so afterwards there is nothing left to tell us which groups to GC. Reject an
			// unknown id here (before any change) rather than deep inside the op.
			const wallet = walletVaultBackground.keyManager.getState().accountModel.wallets[walletId];

			if (!wallet) {
				throw new Error(`Unknown wallet: ${walletId}`);
			}

			const removedAccountGroupIds = wallet.accountGroupIds;

			const next = await walletVaultBackground.keyManager.updateState((current) =>
				removeWalletFromKeyManagerState(current, { walletId }),
			);

			// Removal committed (the last-wallet guard throws inside `removeWallet` above, short-circuiting
			// before this — so nothing is written and no seed is purged on a rejected forget). GC every
			// removed account group's persisted portfolio; best-effort (the stores swallow their own
			// storage errors), so a storage failure can never undo a removal that already succeeded.
			await Promise.all(
				removedAccountGroupIds.map((accountGroupId) => deps.purgeAccountPortfolio(accountGroupId)),
			);

			// Forgetting the wallet reassigned the selected account group: notify connected dapps of the
			// account change and its descriptor change (new account id / descriptor set / policy — ELIP-1).
			emitWalletEvent("accountsChanged");
			emitWalletEvent(LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT);

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
		[accountsRpc.methods.refreshPortfolio]: () => deps.refreshPortfolio(),
		[accountsRpc.methods.getActivity]: (message) =>
			deps.getActivity(message.data as GetActivityInput),
	};
}
