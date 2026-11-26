import { Navigate } from "@tanstack/react-router";
import { useState } from "react";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import { useSelectedAccount } from "@/routes/App/pages/Home/HomeContext/hooks/useSelectedAccount";
import { usePasswordEntry } from "@/routes/LocalAuth/WalletUnlock";
import { UiSpinner } from "@/ui/UiSpinner";

import { RecoveryPhraseGate } from "./components/RecoveryPhraseGate";
import { RecoveryPhraseView } from "./components/RecoveryPhraseView";
import { Route } from "./route";

export function SettingsRecoveryPhrasePage() {
	const { accountGroupId } = Route.useParams();
	const accounts = useSelectedAccount();
	const account = accounts.accountGroups.find((group) => group.id === accountGroupId);
	const [phrase, setPhrase] = useState<string>();
	const entry = usePasswordEntry(async (passphrase) => {
		if (!account) return;

		const revealed = await accountsClient.revealRecoveryPhrase({
			accountGroupId: account.id,
			passphrase,
		});

		setPhrase(revealed.phrase);
	});

	if (accounts.isLoading) {
		return (
			<div className="flex size-full items-center justify-center">
				<UiSpinner />
			</div>
		);
	}

	if (!account) return <Navigate replace to="/app/settings" />;

	return phrase === undefined ? (
		<RecoveryPhraseGate accountGroupId={account.id} entry={entry} />
	) : (
		<RecoveryPhraseView accountGroupId={account.id} phrase={phrase} />
	);
}
