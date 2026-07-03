import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import type { RenameAccountInput } from "@/core/accounts/application/accounts-rpc/model/types";

export const ACCOUNTS_QUERY_KEY = ["accounts"] as const;

/** The account axis: the account groups, the selected one, and a switch mutation. */
export function useSelectedAccount() {
	const queryClient = useQueryClient();
	const query = useQuery({
		queryFn: () => accountsClient.getState(),
		queryKey: ACCOUNTS_QUERY_KEY,
	});

	const selectAccountMutation = useMutation({
		mutationFn: (accountGroupId: AccountGroupId) => accountsClient.setSelected({ accountGroupId }),
		onSuccess: (next) => {
			queryClient.setQueryData(ACCOUNTS_QUERY_KEY, next);
		},
	});

	const renameAccountMutation = useMutation({
		mutationFn: (input: RenameAccountInput) => accountsClient.rename(input),
		onSuccess: (next) => {
			queryClient.setQueryData(ACCOUNTS_QUERY_KEY, next);
		},
	});

	const accountGroups = query.data?.accountGroups ?? [];
	const accountGroup = accountGroups.find(
		(candidate) => candidate.id === query.data?.selectedAccountGroupId,
	);

	return {
		accountGroup,
		accountGroups,
		isError: query.isError,
		isLoading: query.isPending,
		renameAccount: renameAccountMutation.mutate,
		selectAccount: selectAccountMutation.mutate,
	};
}
