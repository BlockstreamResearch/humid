import type { AccountGroupRecord } from "../model/account-group";
import type { AccountModelState } from "../model/account-model";

export function getSelectedAccountGroup(accountModel: AccountModelState): AccountGroupRecord {
	const selectedAccountGroupId = accountModel.selectedAccountGroupId;

	if (selectedAccountGroupId) {
		const selectedAccountGroup = accountModel.accountGroups[selectedAccountGroupId];

		if (selectedAccountGroup) {
			return selectedAccountGroup;
		}
	}

	const [firstAccountGroup] = Object.values(accountModel.accountGroups).toSorted(
		(left, right) => left.createdAt - right.createdAt,
	);

	if (!firstAccountGroup) {
		throw new Error("No account group is available.");
	}

	return firstAccountGroup;
}
