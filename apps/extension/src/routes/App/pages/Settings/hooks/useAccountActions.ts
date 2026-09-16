import { useMutation, useQueryClient } from "@tanstack/react-query";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import type { AccountsState } from "@/core/accounts/application/accounts-rpc/model/types";
import { ACCOUNTS_QUERY_KEY } from "@/routes/App/pages/Home/HomeContext/hooks/useSelectedAccount";

export function useAccountActions() {
	const queryClient = useQueryClient();
	const onSuccess = (next: AccountsState) => {
		queryClient.setQueryData(ACCOUNTS_QUERY_KEY, next);
	};

	return {
		createAccount: useMutation({ mutationFn: accountsClient.createAccount, onSuccess }),
		forgetWallet: useMutation({ mutationFn: accountsClient.removeWallet, onSuccess }),
		importAccount: useMutation({ mutationFn: accountsClient.importAccount, onSuccess }),
		removeAccount: useMutation({ mutationFn: accountsClient.removeAccount, onSuccess }),
	};
}

export function errorMessage(error: unknown): string | null {
	if (!error) return null;

	return error instanceof Error ? error.message : String(error);
}
