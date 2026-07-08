import type { AccountGroupRecord } from "../model/account-group";
import type { AccountModelState } from "../model/account-model";

export type RemovableAccountGroupCollections = {
	accountGroups: AccountModelState["accountGroups"];
	addresses: AccountModelState["addresses"];
	chainAccounts: AccountModelState["chainAccounts"];
};

/**
 * Deletes an account group's record plus everything it materialized — each of its chain accounts and,
 * for each, that chain account's addresses — from the passed-in copies of the model collections. It
 * mutates those copies in place (callers spread the model first, so the input state stays untouched),
 * which is exactly the cleanup `removeAccountGroup` performs for one group. Shared so `removeWallet`
 * can run it for every group of a wallet without duplicating (or diverging from) the deletion order.
 */
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
