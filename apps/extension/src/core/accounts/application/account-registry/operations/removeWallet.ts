import type { AccountGroupRecord } from "../model/account-group";
import type { AccountModelState } from "../model/account-model";
import type { AccountGroupId, KeySourceId, WalletId } from "../model/identifiers";
import { pruneDappSessionsForRemovedAccountGroup } from "./removeAccountGroup";
import { removeAccountGroupEntities } from "./removeAccountGroupEntities";

export type RemoveWalletInput = {
	accountModel: AccountModelState;
	updatedAt?: number;
	walletId: WalletId;
};

export type RemoveWalletResult = {
	accountModel: AccountModelState;
	keySourceId: KeySourceId;
	removedAccountGroupIds: AccountGroupId[];
};

export function removeWallet(input: RemoveWalletInput): RemoveWalletResult {
	const wallet = input.accountModel.wallets[input.walletId];

	if (!wallet) {
		throw new Error(`Wallet is not available: ${input.walletId}`);
	}

	const removedAccountGroupIds = wallet.accountGroupIds;
	const removedGroupIds = new Set<AccountGroupId>(removedAccountGroupIds);

	const survivingGroups = Object.values(input.accountModel.accountGroups).filter(
		(group) => !removedGroupIds.has(group.id),
	);

	if (survivingGroups.length === 0) {
		throw new Error("Cannot forget the only wallet; at least one wallet must remain.");
	}

	const now = input.updatedAt ?? Date.now();

	const accountGroups = { ...input.accountModel.accountGroups };
	const chainAccounts = { ...input.accountModel.chainAccounts };
	const addresses = { ...input.accountModel.addresses };

	let dappSessionsModel = input.accountModel;

	for (const accountGroupId of removedAccountGroupIds) {
		const group = input.accountModel.accountGroups[accountGroupId];

		if (group) {
			removeAccountGroupEntities({ accountGroups, addresses, chainAccounts }, group);
			dappSessionsModel = pruneDappSessionsForRemovedAccountGroup(dappSessionsModel, group, now);
		}
	}

	const wallets = { ...input.accountModel.wallets };
	delete wallets[wallet.id];

	const keySources = { ...input.accountModel.keySources };
	delete keySources[wallet.keySourceId];

	const selectedWasRemoved =
		input.accountModel.selectedAccountGroupId !== undefined &&
		removedGroupIds.has(input.accountModel.selectedAccountGroupId);
	const selectedAccountGroupId = selectedWasRemoved
		? pickFallbackSelectedGroupId(survivingGroups)
		: input.accountModel.selectedAccountGroupId;

	return {
		accountModel: {
			...input.accountModel,
			accountGroups,
			addresses,
			chainAccounts,
			dappSessions: dappSessionsModel.dappSessions,
			keySources,
			selectedAccountGroupId,
			updatedAt: now,
			wallets,
		},
		keySourceId: wallet.keySourceId,
		removedAccountGroupIds,
	};
}

function pickFallbackSelectedGroupId(survivingGroups: AccountGroupRecord[]): AccountGroupId {
	const [fallback] = survivingGroups.toSorted(
		(left, right) =>
			(left.groupIndex ?? 0) - (right.groupIndex ?? 0) || left.createdAt - right.createdAt,
	);

	return fallback.id;
}
