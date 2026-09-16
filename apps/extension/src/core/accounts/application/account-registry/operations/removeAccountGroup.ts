import type { AccountGroupRecord } from "../model/account-group";
import type { AccountModelState } from "../model/account-model";
import type { AccountGroupId, ChainAccountId } from "../model/identifiers";
import { removeAccountGroupEntities } from "./removeAccountGroupEntities";
import { revokeAccountFromDappSession } from "./revokeAccountFromDappSession";

export type RemoveAccountGroupInput = {
	accountGroupId: AccountGroupId;
	accountModel: AccountModelState;
	updatedAt?: number;
};

export type RemoveAccountGroupResult = {
	accountModel: AccountModelState;
};

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

	const { dappSessions } = pruneDappSessionsForRemovedAccountGroup(input.accountModel, group, now);

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
			dappSessions,
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

export function pruneDappSessionsForRemovedAccountGroup(
	accountModel: AccountModelState,
	group: AccountGroupRecord,
	updatedAt: number,
): AccountModelState {
	const affectedSessions = Object.values(accountModel.dappSessions).filter((session) =>
		session.scope.accountGroupIds.includes(group.id),
	);

	if (affectedSessions.length === 0) return accountModel;

	const removedChainAccountIds = new Set<ChainAccountId>(group.chainAccountIds);
	const dappSessions = { ...accountModel.dappSessions };

	for (const session of affectedSessions) {
		dappSessions[session.id] = {
			...session,
			scope: {
				...session.scope,
				chainAccountIds: session.scope.chainAccountIds.filter(
					(id) => !removedChainAccountIds.has(id),
				),
			},
		};
	}

	let model: AccountModelState = { ...accountModel, dappSessions };

	for (const session of affectedSessions) {
		model = revokeAccountFromDappSession({
			accountGroupId: group.id,
			accountModel: model,
			sessionId: session.id,
			updatedAt,
		}).accountModel;
	}

	return model;
}
