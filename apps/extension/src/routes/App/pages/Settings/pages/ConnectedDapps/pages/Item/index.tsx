import { Navigate } from "@tanstack/react-router";

import { connectedDappKey, useConnectedDapps } from "@/routes/App/components/ConnectedDapps";
import { useSelectedAccount } from "@/routes/App/pages/Home/HomeContext/hooks/useSelectedAccount";
import { UiSpinner } from "@/ui/UiSpinner";

import { ConnectedDappItemView } from "./components/ConnectedDappItemView";
import { Route } from "./route";

export function ConnectedDappItemPage() {
	const { accountGroupId, dappKey } = Route.useParams();
	const accounts = useSelectedAccount();
	const { dapps, isLoading, revoke, revokingKey, setMethodSilent, settingMethod } =
		useConnectedDapps(accountGroupId);

	if (accounts.isLoading || isLoading) {
		return (
			<div className="flex size-full items-center justify-center">
				<UiSpinner />
			</div>
		);
	}

	const account = accounts.accountGroups.find((group) => group.id === accountGroupId);

	if (!account) return <Navigate replace to="/app/settings" />;

	const dapp = dapps.find((candidate) => connectedDappKey(candidate) === dappKey);

	if (!dapp) {
		return (
			<Navigate
				replace
				params={{ accountGroupId }}
				to="/app/settings/account/$accountGroupId/connected-dapps"
			/>
		);
	}

	return (
		<ConnectedDappItemView
			accountGroupId={account.id}
			accountName={account.name}
			dapp={dapp}
			isRevoking={revokingKey === connectedDappKey(dapp)}
			onRevoke={() => revoke(dapp)}
			onToggleMethod={(method, silent) => setMethodSilent(dapp, method, silent)}
			settingMethod={settingMethod}
		/>
	);
}
