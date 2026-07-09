import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import { useSelectedAccount } from "@/routes/App/pages/Home/HomeContext/hooks/useSelectedAccount";
import { UiSpinner } from "@/ui/UiSpinner";

import { RecoveryPhraseView } from "./components/RecoveryPhraseView";
import { Route } from "./route";

/**
 * Reveal recovery phrase (container): validates the account from the route param, then
 * fetches its mnemonic on demand. The result is not cached (gcTime 0) so the secret
 * does not linger in the query cache after the screen closes.
 */
export function SettingsRecoveryPhrasePage() {
	const { accountGroupId } = Route.useParams();
	const accounts = useSelectedAccount();
	const account = accounts.accountGroups.find((group) => group.id === accountGroupId);

	const phraseQuery = useQuery({
		enabled: account !== undefined,
		gcTime: 0,
		queryFn: () => {
			if (!account) throw new Error("Account not found.");

			return accountsClient.revealRecoveryPhrase({ accountGroupId: account.id });
		},
		queryKey: ["recoveryPhrase", accountGroupId],
		staleTime: 0,
	});

	if (accounts.isLoading) {
		return (
			<div className="flex size-full items-center justify-center">
				<UiSpinner />
			</div>
		);
	}

	if (!account || phraseQuery.isError) return <Navigate replace to="/app/settings" />;

	if (!phraseQuery.data) {
		return (
			<div className="flex size-full items-center justify-center">
				<UiSpinner />
			</div>
		);
	}

	return <RecoveryPhraseView accountGroupId={account.id} phrase={phraseQuery.data.phrase} />;
}
