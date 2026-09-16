import { Navigate, useNavigate } from "@tanstack/react-router";

import { useSelectedAccount } from "@/routes/App/pages/Home/HomeContext/hooks/useSelectedAccount";
import {
	errorMessage,
	useAccountActions,
} from "@/routes/App/pages/Settings/hooks/useAccountActions";
import { UiSpinner } from "@/ui/UiSpinner";

import { AccountDetailView } from "./components/AccountDetailView";
import { Route } from "./route";

export function SettingsAccountPage() {
	const { accountGroupId } = Route.useParams();
	const navigate = useNavigate();
	const accounts = useSelectedAccount();
	const { forgetWallet, removeAccount } = useAccountActions();

	if (accounts.isLoading) {
		return (
			<div className="flex size-full items-center justify-center">
				<UiSpinner />
			</div>
		);
	}

	const account = accounts.accountGroups.find((group) => group.id === accountGroupId);

	if (!account) return <Navigate replace to="/app/settings" />;

	const canForgetWallet = accounts.accountGroups.some(
		(group) => group.walletId !== account.walletId,
	);

	return (
		<AccountDetailView
			accountGroupId={account.id}
			accountName={account.name}
			canForgetWallet={canForgetWallet}
			forgetError={errorMessage(forgetWallet.error)}
			isForgetting={forgetWallet.isPending}
			isRemoving={removeAccount.isPending}
			onForgetWallet={() =>
				forgetWallet.mutate(
					{ walletId: account.walletId },
					{ onSuccess: () => void navigate({ to: "/app/settings" }) },
				)
			}
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
