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

	// Prune the removed group from any dapp session it was authorized in (deleting a session left with
	// no authorized account). Runs off `input.accountModel` — before the deletions above are committed —
	// because it reads the group's chain-account ids to strip them from each session's scope.
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

/**
 * Purge a removed account group from every dapp session that authorized it. For each injected session
 * whose scope granted this group, strip the group's chain-account ids from the scope, then reuse
 * {@link revokeAccountFromDappSession}'s prune→delete-if-empty on the account grant itself — so a
 * session left authorizing no account is deleted entirely (a full disconnect for that origin). Pure
 * and synchronous, and reads `group.chainAccountIds` off the passed record, so it must run BEFORE the
 * group's chain accounts are deleted. Shared so `removeAccountGroup` (one group) and `removeWallet`
 * (its whole loop of groups) prune identically; returns the model with only `dappSessions` changed.
 */
export function pruneDappSessionsForRemovedAccountGroup(
	accountModel: AccountModelState,
	group: AccountGroupRecord,
	updatedAt: number,
): AccountModelState {
	const affectedSessions = Object.values(accountModel.dappSessions).filter((session) =>
		session.scope.accountGroupIds.includes(group.id),
	);

	if (affectedSessions.length === 0) return accountModel;

	// Drop the removed group's chain accounts from every affected session's scope first — the account-
	// grant prune below (revokeAccountFromDappSession) only touches `accountGroupIds`. Mutating a fresh
	// copy, the same controlled-mutation shape revokeAccountFromDappSession itself uses.
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

	// Then reuse the shared prune→delete-if-empty for the account grant on each affected session: a
	// session left authorizing no account is deleted entirely (a full disconnect for that origin).
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
