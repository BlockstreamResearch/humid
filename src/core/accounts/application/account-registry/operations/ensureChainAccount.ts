import type { AccountTypeRegistry } from "../account-types/AccountTypeRegistry";
import { createChainAccountId } from "../ids/createAccountModelId";
import type { AccountModelState } from "../model/account-model";
import type { ChainAccountMetadata, ChainAccountTypeId } from "../model/account-type";
import type { ChainAccountRecord } from "../model/chain-account";
import type { AccountGroupId, ChainId } from "../model/identifiers";
import { getSelectedAccountGroup } from "./getSelectedAccountGroup";
import { resolveChainAccount } from "./resolveChainAccount";

export type EnsureChainAccountInput<TContext extends object = object> = {
	accountGroupId?: AccountGroupId;
	accountModel: AccountModelState;
	accountTypeId: ChainAccountTypeId;
	accountTypes: AccountTypeRegistry;
	chainId: ChainId;
	context: TContext;
	createdAt?: number;
};

export type EnsureChainAccountResult<
	TMetadata extends ChainAccountMetadata = ChainAccountMetadata,
> = {
	accountModel: AccountModelState;
	chainAccount: ChainAccountRecord<TMetadata>;
};

export function ensureChainAccount<TContext extends object, TMetadata extends ChainAccountMetadata>(
	input: EnsureChainAccountInput<TContext>,
): EnsureChainAccountResult<TMetadata> {
	const accountType = input.accountTypes.get<TContext, TMetadata>(input.accountTypeId);
	const materialized = accountType.materialize({
		chainId: input.chainId,
		context: input.context,
	});
	const accountGroup = input.accountGroupId
		? input.accountModel.accountGroups[input.accountGroupId]
		: getSelectedAccountGroup(input.accountModel);

	if (!accountGroup) {
		throw new Error(`Account group is not available: ${input.accountGroupId}`);
	}

	const existingChainAccount = resolveChainAccount<TMetadata>({
		accountGroupId: accountGroup.id,
		accountIdentifier: materialized.accountIdentifier,
		accountModel: input.accountModel,
		accountTypeId: accountType.id,
		chainGroupId: accountType.chainGroupId,
		chainId: input.chainId,
	});

	if (existingChainAccount) {
		return { accountModel: input.accountModel, chainAccount: existingChainAccount };
	}

	const conflictingChainAccount = resolveChainAccount<TMetadata>({
		accountGroupId: accountGroup.id,
		accountModel: input.accountModel,
		accountTypeId: accountType.id,
		chainGroupId: accountType.chainGroupId,
		chainId: input.chainId,
	});

	if (conflictingChainAccount) {
		throw new Error(
			`Chain account already exists for ${input.chainId} with another account identifier.`,
		);
	}

	const wallet = input.accountModel.wallets[accountGroup.walletId];

	if (!wallet) {
		throw new Error(`Wallet is not available: ${accountGroup.walletId}`);
	}

	const now = input.createdAt ?? Date.now();
	const chainAccount: ChainAccountRecord<TMetadata> = {
		accountGroupId: accountGroup.id,
		accountIdentifier: materialized.accountIdentifier,
		accountTypeId: accountType.id,
		addressIds: [],
		chainGroupId: accountType.chainGroupId,
		chainId: input.chainId,
		createdAt: now,
		derivation: materialized.derivation,
		id: createChainAccountId(),
		keySourceId: wallet.keySourceId,
		metadata: materialized.metadata,
		updatedAt: now,
		walletId: wallet.id,
	};
	const updatedAccountGroup = {
		...accountGroup,
		chainAccountIds: [...accountGroup.chainAccountIds, chainAccount.id],
		updatedAt: now,
	};

	return {
		accountModel: {
			...input.accountModel,
			accountGroups: {
				...input.accountModel.accountGroups,
				[updatedAccountGroup.id]: updatedAccountGroup,
			},
			chainAccounts: {
				...input.accountModel.chainAccounts,
				[chainAccount.id]: chainAccount,
			},
			updatedAt: now,
		},
		chainAccount,
	};
}
