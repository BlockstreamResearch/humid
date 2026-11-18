import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useConfirm } from "@/common/Confirmation";
import { walletVaultClient } from "@/core/secure-vault/application/wallet-vault/client";
import { UiButton } from "@/ui/UiButton/base";
import { UiFieldError } from "@/ui/UiField";

import { UnlockScreen, useWalletUnlock } from "./WalletUnlock";

type LocalAuthPageProps = {
	onUnlocked?: () => void;
	onReset?: () => void;
};

export function LocalAuthRoutePage() {
	const navigate = useNavigate();

	return (
		<LocalAuthPage
			onReset={() => void navigate({ to: "/auth/intro" })}
			onUnlocked={() => void navigate({ to: "/app" })}
		/>
	);
}

export function LocalAuthPage({ onReset, onUnlocked }: LocalAuthPageProps) {
	const confirm = useConfirm();
	const unlock = useWalletUnlock(onUnlocked);
	const [resetNotice, setResetNotice] = useState<string | null>(null);
	const resetVaultMutation = useMutation({
		mutationFn: walletVaultClient.reset,
		onSuccess: (status) => {
			if (!status.hasVault) {
				onReset?.();
			}
		},
	});
	const isMutating = unlock.isPending || resetVaultMutation.isPending;

	const clearResetFeedback = () => {
		setResetNotice(null);
		resetVaultMutation.reset();
	};

	const handleReset = async () => {
		if (isMutating) return;

		clearResetFeedback();
		unlock.clearError();

		const { approved } = await confirm({
			title: "Reset wallet?",
			message:
				"This erases the wallet from this browser. Only the recovery phrase can restore access.",
		});

		if (!approved) {
			setResetNotice("Reset cancelled. The wallet is still on this device.");
			return;
		}

		resetVaultMutation.mutate();
	};

	return (
		<UnlockScreen
			unlock={unlock}
			title="Unlock Humid"
			statement="Enter the password to open the wallet."
			disabled={isMutating}
			onEdit={clearResetFeedback}
			notices={
				<>
					<UiFieldError>{resetVaultMutation.error?.message}</UiFieldError>
					{resetNotice && <p className="text-muted-foreground text-sm leading-5">{resetNotice}</p>}
				</>
			}
			secondary={
				onReset && (
					<UiButton type="button" variant="outline" disabled={isMutating} onClick={handleReset}>
						{resetVaultMutation.isPending ? "Resetting…" : "Reset wallet"}
					</UiButton>
				)
			}
		/>
	);
}
