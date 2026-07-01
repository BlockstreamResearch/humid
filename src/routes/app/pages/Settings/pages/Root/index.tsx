import { useMutation } from "@tanstack/react-query";

import { walletVaultClient } from "@/core/secure-vault/application/wallet-vault/client";
import { useSelectedAccount } from "@/routes/App/pages/Home/HomeContext/hooks/useSelectedAccount";
import { UiSpinner } from "@/ui/UiSpinner";

import { SettingsRootView } from "./components/SettingsRootView";

/**
 * Settings root (container): reads the account axis and wires the vault lock, then
 * hands display data + handlers to the presentational view. Storybook renders the
 * view directly with mock data.
 */
export function SettingsRootPage() {
	const accounts = useSelectedAccount();
	const lockMutation = useMutation({ mutationFn: () => walletVaultClient.lock() });

	if (accounts.isLoading) {
		return (
			<div className="flex size-full items-center justify-center">
				<UiSpinner />
			</div>
		);
	}

	return (
		<SettingsRootView
			accountGroups={accounts.accountGroups}
			isLocking={lockMutation.isPending}
			onLock={() => lockMutation.mutate()}
			onSwitch={accounts.selectAccount}
			selectedAccountGroupId={accounts.accountGroup?.id ?? null}
		/>
	);
}
