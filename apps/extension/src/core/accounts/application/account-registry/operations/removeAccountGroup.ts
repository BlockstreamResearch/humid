import type { AccountModelState } from "../model/account-model";
import type { AccountGroupId } from "../model/identifiers";
import { removeAccountGroupEntities } from "./removeAccountGroupEntities";

export type RemoveAccountGroupInput = {
	accountGroupId: AccountGroupId;
	accountModel: AccountModelState;
	updatedAt?: number;
};

export type RemoveAccountGroupResult = {
	accountModel: AccountModelState;
};

/**
 * Removes an account group and its materialized chain accounts + addresses. A group can
 * only be removed while its wallet has another group, so "remove account" never destroys
 * a seed (forgetting a whole wallet/seed is a separate flow). Reassigns the selected
 * group if the removed one was selected. Chain-agnostic — no signing, no chain specifics.
 */
export function removeAccountGroup(input: RemoveAccountGroupInput): RemoveAccountGroupResult {
	const group = input.accountModel.accountGroups[input.accountGroupId];

	if (!group) {
		throw new Error(`Account group is not available: ${input.accountGroupId}`);
	}

	const wallet = input.accountModel.wallets[group.walletId];

	if (!wallet) {
		throw new Error(`Wallet is not available: ${group.walletId}`);
	}

	const remainingGroupIds = wallet.accountGroupIds.filter((id) => id !== group.id);

	if (remainingGroupIds.length === 0) {
		throw new Error("Cannot remove the wallet's only account; forget the wallet instead.");
	}

	const now = input.updatedAt ?? Date.now();

	const accountGroups = { ...input.accountModel.accountGroups };
	const chainAccounts = { ...input.accountModel.chainAccounts };
	const addresses = { ...input.accountModel.addresses };

	removeAccountGroupEntities({ accountGroups, addresses, chainAccounts }, group);

	const selectedAccountGroupId =
		input.accountModel.selectedAccountGroupId === group.id
			? remainingGroupIds[0]
			: input.accountModel.selectedAccountGroupId;

	return {
		accountModel: {
			...input.accountModel,
			accountGroups,
			addresses,
			chainAccounts,
			selectedAccountGroupId,
			updatedAt: now,
			wallets: {
				...input.accountModel.wallets,
				[wallet.id]: {
					...wallet,
					accountGroupIds: remainingGroupIds,
					updatedAt: now,
				},
			},
		},
	};
}
