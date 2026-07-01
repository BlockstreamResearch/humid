import { Navigate } from "@tanstack/react-router";

import { useSelectedAccount } from "@/routes/App/pages/Home/HomeContext/hooks/useSelectedAccount";
import { UiSpinner } from "@/ui/UiSpinner";

import { AccountDetailView } from "./components/AccountDetailView";
import { Route } from "./route";

/**
 * Per-account settings (container): resolves the account from the route param and
 * wires rename. Unknown ids fall back to the settings root.
 */
export function SettingsAccountPage() {
	const { accountGroupId } = Route.useParams();
	const accounts = useSelectedAccount();

	if (accounts.isLoading) {
		return (
			<div className="flex size-full items-center justify-center">
				<UiSpinner />
			</div>
		);
	}

	const account = accounts.accountGroups.find((group) => group.id === accountGroupId);

	if (!account) return <Navigate replace to="/app/settings" />;

	return (
		<AccountDetailView
			accountGroupId={account.id}
			accountName={account.name}
			onRename={(name) => accounts.renameAccount({ accountGroupId: account.id, name })}
		/>
	);
}
