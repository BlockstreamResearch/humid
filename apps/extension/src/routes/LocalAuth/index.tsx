import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useConfirm } from "@/common/Confirmation";
import { walletVaultClient } from "@/core/secure-vault/application/wallet-vault/client";
import { WalletUnlockForm } from "@/core/secure-vault/application/wallet-vault/WalletUnlockForm";
import { UiFieldError } from "@/ui/UiField";
import UiPageBackgroundWrp from "@/ui/UiPageBackgroundWrp";

function getErrorMessage(error: unknown): string | null {
	if (!error) return null;

	return error instanceof Error ? error.message : String(error);
}

export function LocalAuthPage() {
	const navigate = useNavigate();
	const confirm = useConfirm();
	const [resetNotice, setResetNotice] = useState<string | null>(null);
	const resetVaultMutation = useMutation({
		mutationFn: walletVaultClient.reset,
		onSuccess: (status) => {
			if (!status.hasVault) {
				void navigate({ to: "/auth/intro" });
			}
		},
	});
	const resetErrorMessage = getErrorMessage(resetVaultMutation.error);

	const clearFeedback = () => {
		setResetNotice(null);
		resetVaultMutation.reset();
	};

	const handleReset = async () => {
		if (resetVaultMutation.isPending) return;

		clearFeedback();

		const { approved } = await confirm({
			title: "Reset wallet?",
			message: "This will remove the encrypted wallet from this browser profile.",
		});

		if (!approved) {
			setResetNotice("Reset cancelled. Your encrypted wallet is still on this device.");
			return;
		}

		resetVaultMutation.mutate();
	};

	return (
		<UiPageBackgroundWrp>
			<main className="flex size-full flex-col gap-4 p-5">
				<WalletUnlockForm
					layout="page"
					onUnlocked={() => void navigate({ to: "/app" })}
					secondaryAction={{
						label: resetVaultMutation.isPending ? "Resetting..." : "Reset wallet",
						onClick: () => void handleReset(),
					}}
					disabled={resetVaultMutation.isPending}
					onPasswordChange={clearFeedback}
					feedback={
						<>
							<UiFieldError>{resetErrorMessage}</UiFieldError>
							{resetNotice && (
								<p className="text-muted-foreground text-sm leading-5">{resetNotice}</p>
							)}
						</>
					}
				>
					<div className="flex flex-col gap-3">
						<p className="text-muted-foreground text-xs font-medium tracking-normal uppercase">
							Locked
						</p>
						<h1 className="cn-font-heading text-2xl leading-tight font-semibold">Unlock Humid</h1>
						<p className="text-muted-foreground text-sm leading-6">
							A local wallet exists. Unlock it to continue to the app area.
						</p>
					</div>
				</WalletUnlockForm>
			</main>
		</UiPageBackgroundWrp>
	);
}
