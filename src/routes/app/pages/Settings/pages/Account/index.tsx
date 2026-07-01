import { Navigate, useNavigate } from "@tanstack/react-router";

import { useSelectedAccount } from "@/routes/App/pages/Home/HomeContext/hooks/useSelectedAccount";
import {
	errorMessage,
	useAccountActions,
} from "@/routes/App/pages/Settings/hooks/useAccountActions";
import { UiSpinner } from "@/ui/UiSpinner";

import { AccountDetailView } from "./components/AccountDetailView";
import { Route } from "./route";

/**
 * Per-account settings (container): resolves the account from the route param and wires
 * rename + remove. Unknown ids fall back to the settings root; removal returns there.
 */
export function SettingsAccountPage() {
	const { accountGroupId } = Route.useParams();
	const navigate = useNavigate();
	const accounts = useSelectedAccount();
	const { removeAccount } = useAccountActions();

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
			isRemoving={removeAccount.isPending}
			onRemove={() =>
				removeAccount.mutate(
					{ accountGroupId: account.id },
					{ onSuccess: () => void navigate({ to: "/app/settings" }) },
				)
			}
			onRename={(name) => accounts.renameAccount({ accountGroupId: account.id, name })}
			removeError={errorMessage(removeAccount.error)}
		/>
	);
}
