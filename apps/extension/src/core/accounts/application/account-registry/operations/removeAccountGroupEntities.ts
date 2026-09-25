import type { AccountGroupRecord } from "../model/account-group";
import type { AccountModelState } from "../model/account-model";

export type RemovableAccountGroupCollections = {
	accountGroups: AccountModelState["accountGroups"];
	addresses: AccountModelState["addresses"];
	chainAccounts: AccountModelState["chainAccounts"];
};

export function removeAccountGroupEntities(
	collections: RemovableAccountGroupCollections,
	group: AccountGroupRecord,
): void {
	for (const chainAccountId of group.chainAccountIds) {
		for (const addressId of collections.chainAccounts[chainAccountId]?.addressIds ?? []) {
			delete collections.addresses[addressId];
		}

		delete collections.chainAccounts[chainAccountId];
	}

	delete collections.accountGroups[group.id];
}
