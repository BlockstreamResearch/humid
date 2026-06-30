import type { AccountModelState } from "../model/account-model";
import type { ChainAccountMetadata, ChainAccountTypeId, ChainGroupId } from "../model/account-type";
import type { ChainAccountRecord } from "../model/chain-account";
import type { AccountGroupId, AccountIdentifier, ChainId } from "../model/identifiers";
import { getSelectedAccountGroup } from "./getSelectedAccountGroup";

export type ResolveChainAccountInput = {
	accountGroupId?: AccountGroupId;
	accountIdentifier?: AccountIdentifier;
	accountModel: AccountModelState;
	accountTypeId?: ChainAccountTypeId;
	chainGroupId?: ChainGroupId;
	chainId: ChainId;
};

export function resolveChainAccount<TMetadata extends ChainAccountMetadata = ChainAccountMetadata>({
	accountGroupId,
	accountIdentifier,
	accountModel,
	accountTypeId,
	chainGroupId,
	chainId,
}: ResolveChainAccountInput): ChainAccountRecord<TMetadata> | null {
	const accountGroup = accountGroupId
		? accountModel.accountGroups[accountGroupId]
		: getSelectedAccountGroup(accountModel);

	if (!accountGroup) {
		throw new Error(`Account group is not available: ${accountGroupId}`);
	}

	for (const chainAccountId of accountGroup.chainAccountIds) {
		const chainAccount = accountModel.chainAccounts[chainAccountId];

		if (!chainAccount) continue;
		if (chainAccount.chainId !== chainId) continue;
		if (accountIdentifier && chainAccount.accountIdentifier !== accountIdentifier) continue;
		if (accountTypeId && chainAccount.accountTypeId !== accountTypeId) continue;
		if (chainGroupId && chainAccount.chainGroupId !== chainGroupId) continue;

		return chainAccount as ChainAccountRecord<TMetadata>;
	}

	return null;
}
