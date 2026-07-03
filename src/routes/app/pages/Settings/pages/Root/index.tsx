import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { DEFAULT_AUTO_LOCK_MINUTES } from "@/core/secure-vault/application/wallet-vault/auto-lock";
import { walletVaultClient } from "@/core/secure-vault/application/wallet-vault/client";
import { useSelectedAccount } from "@/routes/App/pages/Home/HomeContext/hooks/useSelectedAccount";
import { UiSpinner } from "@/ui/UiSpinner";

import { SettingsRootView } from "./components/SettingsRootView";

const AUTO_LOCK_QUERY_KEY = ["wallet-vault", "auto-lock"] as const;

/**
 * Settings root (container): reads the account axis and wires the vault lock + idle auto-lock, then
 * hands display data + handlers to the presentational view. Storybook renders the view directly
 * with mock data.
 */
export function SettingsRootPage() {
	const accounts = useSelectedAccount();
	const queryClient = useQueryClient();
	const lockMutation = useMutation({ mutationFn: () => walletVaultClient.lock() });
	const autoLockQuery = useQuery({
		queryFn: () => walletVaultClient.getAutoLock(),
		queryKey: AUTO_LOCK_QUERY_KEY,
	});
	const autoLockMutation = useMutation({
		mutationFn: (minutes: number) => walletVaultClient.setAutoLock(minutes),
		onSuccess: (result) => queryClient.setQueryData(AUTO_LOCK_QUERY_KEY, result),
	});

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
			autoLockMinutes={autoLockQuery.data?.minutes ?? DEFAULT_AUTO_LOCK_MINUTES}
			isLocking={lockMutation.isPending}
			onAutoLockChange={(minutes) => autoLockMutation.mutate(minutes)}
			onLock={() => lockMutation.mutate()}
			onSwitch={accounts.selectAccount}
			selectedAccountGroupId={accounts.accountGroup?.id ?? null}
		/>
	);
}
