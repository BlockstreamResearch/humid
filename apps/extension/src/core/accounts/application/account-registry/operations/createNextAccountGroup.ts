import { createAccountGroupId } from "../ids/createAccountModelId";
import type { AccountGroupRecord } from "../model/account-group";
import type { AccountModelState } from "../model/account-model";
import type { WalletId } from "../model/identifiers";

export type CreateNextAccountGroupInput = {
	accountModel: AccountModelState;
	createdAt?: number;
	name?: string;
	walletId: WalletId;
};

export type CreateNextAccountGroupResult = {
	accountGroup: AccountGroupRecord;
	accountModel: AccountModelState;
};

export function createNextAccountGroup(
	input: CreateNextAccountGroupInput,
): CreateNextAccountGroupResult {
	const wallet = input.accountModel.wallets[input.walletId];

	if (!wallet) {
		throw new Error(`Wallet is not available: ${input.walletId}`);
	}

	const nextGroupIndex =
		wallet.accountGroupIds.reduce((max, groupId) => {
			const groupIndex = input.accountModel.accountGroups[groupId]?.groupIndex ?? 0;

			return Math.max(max, groupIndex);
		}, -1) + 1;

	const now = input.createdAt ?? Date.now();
	const accountGroup: AccountGroupRecord = {
		chainAccountIds: [],
		createdAt: now,
		groupIndex: nextGroupIndex,
		id: createAccountGroupId(),
		kind: "multichain",
		name: input.name ?? `Account ${nextGroupIndex + 1}`,
		updatedAt: now,
		walletId: wallet.id,
	};

	return {
		accountGroup,
		accountModel: {
			...input.accountModel,
			accountGroups: {
				...input.accountModel.accountGroups,
				[accountGroup.id]: accountGroup,
			},
			updatedAt: now,
			wallets: {
				...input.accountModel.wallets,
				[wallet.id]: {
					...wallet,
					accountGroupIds: [...wallet.accountGroupIds, accountGroup.id],
					updatedAt: now,
				},
			},
		},
	};
}
