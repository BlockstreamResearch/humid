import { Navigate } from "@tanstack/react-router";

import { useConnectedDapps } from "@/routes/App/components/ConnectedDapps";
import { useSelectedAccount } from "@/routes/App/pages/Home/HomeContext/hooks/useSelectedAccount";
import { UiSpinner } from "@/ui/UiSpinner";

import { ConnectedDappsListView } from "./components/ConnectedDappsListView";
import { Route } from "./route";

/**
 * Per-account connected dapps (container): resolves the account from the route param, then lists the
 * dapps connected to it, each drilling into its per-method policy. Unknown ids fall back to settings.
 */
export function ConnectedDappsListPage() {
	const { accountGroupId } = Route.useParams();
	const accounts = useSelectedAccount();
	const { dapps, isError, isLoading } = useConnectedDapps(accountGroupId);

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
		<ConnectedDappsListView
			accountGroupId={account.id}
			accountName={account.name}
			dapps={dapps}
			isError={isError}
			isLoading={isLoading}
		/>
	);
}
