import { Navigate } from "@tanstack/react-router";

import { useSelectedAccount } from "@/routes/App/pages/Home/HomeContext/hooks/useSelectedAccount";
import { UiSpinner } from "@/ui/UiSpinner";

import { ConnectedDappsView } from "./components/ConnectedDappsView";
import { Route } from "./route";

/**
 * Per-account connected dapps (container): resolves the account from the route param, then lists the
 * dapps connected to it with a per-account disconnect. Unknown ids fall back to the settings root.
 */
export function SettingsConnectedDappsPage() {
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

	return <ConnectedDappsView accountGroupId={account.id} accountName={account.name} />;
}
