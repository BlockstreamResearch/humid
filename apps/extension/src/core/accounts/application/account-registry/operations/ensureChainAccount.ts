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
		// This (group, chain, type) already has a chain account, but with a different identifier than
		// the one we just materialized. For a deterministic account type (a descriptor wallet, whose
		// identifier is a pure function of group + chain + seed), a mismatch means the stored record is
		// stale — e.g. persisted under the wrong group by an earlier bug. The freshly materialized
		// identity is authoritative, so reconcile the record in place (keeping its id + createdAt)
		// instead of failing: this self-heals corrupted state rather than wedging every future call.
		const reconciledAt = input.createdAt ?? Date.now();
		const reconciledChainAccount: ChainAccountRecord<TMetadata> = {
			...conflictingChainAccount,
			accountIdentifier: materialized.accountIdentifier,
			addressIds: [],
			derivation: materialized.derivation,
			metadata: materialized.metadata,
			updatedAt: reconciledAt,
		};

		return {
			accountModel: {
				...input.accountModel,
				chainAccounts: {
					...input.accountModel.chainAccounts,
					[reconciledChainAccount.id]: reconciledChainAccount,
				},
				updatedAt: reconciledAt,
			},
			chainAccount: reconciledChainAccount,
		};
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
