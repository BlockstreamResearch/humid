import {
	createAccountGroupId,
	createKeySourceId,
	createWalletId,
} from "../ids/createAccountModelId";
import type { AccountModelState } from "../model/account-model";
import type { KeySourceId } from "../model/identifiers";

export type CreateLocalRootAccountModelInput = {
	createdAt?: number;
	keySourceId?: KeySourceId;
	name?: string;
	source?: "generated" | "imported";
};

export type CreateLocalRootAccountModelResult = {
	accountModel: AccountModelState;
	keySourceId: KeySourceId;
};

export function createLocalRootAccountModel(
	input: CreateLocalRootAccountModelInput = {},
): CreateLocalRootAccountModelResult {
	const now = input.createdAt ?? Date.now();
	const keySourceId = input.keySourceId ?? createKeySourceId();
	const walletId = createWalletId();
	const accountGroupId = createAccountGroupId();
	const walletName = input.name ?? "Local root";
	const source = input.source ?? "generated";

	return {
		accountModel: {
			accountGroups: {
				[accountGroupId]: {
					chainAccountIds: [],
					createdAt: now,
					groupIndex: 0,
					id: accountGroupId,
					kind: "multichain",
					metadata: { source },
					name: "Account 1",
					updatedAt: now,
					walletId,
				},
			},
			addresses: {},
			chainAccounts: {},
			dappSessions: {},
			keySources: {
				[keySourceId]: {
					createdAt: now,
					id: keySourceId,
					kind: "local-root",
					material: {
						kind: "seed",
						storage: "encrypted-vault",
					},
					metadata: { source },
					name: walletName,
					updatedAt: now,
				},
			},
			selectedAccountGroupId: accountGroupId,
			updatedAt: now,
			version: 1,
			wallets: {
				[walletId]: {
					accountGroupIds: [accountGroupId],
					createdAt: now,
					id: walletId,
					keySourceId,
					kind: "entropy",
					name: walletName,
					updatedAt: now,
				},
			},
		},
		keySourceId,
	};
}
