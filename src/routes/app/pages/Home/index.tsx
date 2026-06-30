import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useConfirm } from "@/common/ConfirmationPopup";
import { walletVaultClient } from "@/core/secure-vault/application/wallet-vault/client";
import { UiButton } from "@/ui/UiButton/base";

export function AppHomePage() {
	const navigate = useNavigate();
	const confirm = useConfirm();
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const handleLock = async () => {
		setError(null);
		setNotice(null);

		try {
			await walletVaultClient.lock();
			void navigate({ to: "/local-auth" });
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : String(requestError));
		}
	};

	const handleReset = async () => {
		setError(null);
		setNotice(null);

		try {
			const confirmed = await confirm(
				"Reset local vault?",
				"This will remove the encrypted vault from this browser profile.",
			);

			if (!confirmed) {
				setNotice("Reset cancelled. Your encrypted vault is still active.");
				return;
			}

			const status = await walletVaultClient.reset();

			if (!status.hasVault) {
				void navigate({ to: "/auth/intro" });
				return;
			}
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : String(requestError));
		}
	};

	return (
		<main className="flex size-full flex-col gap-4 p-5">
			<div className="flex flex-1 flex-col justify-center gap-3">
				<p className="text-muted-foreground text-xs font-medium tracking-normal uppercase">
					Authorized
				</p>
				<h1 className="cn-font-heading text-2xl leading-tight font-semibold">Humid app</h1>
				<p className="text-muted-foreground text-sm leading-6">
					This route is available only when a local vault exists and is unlocked.
				</p>
			</div>

			{error && <p className="text-destructive text-sm">{error}</p>}
			{notice && <p className="text-muted-foreground text-sm leading-5">{notice}</p>}

			<div className="flex gap-2">
				<UiButton type="button" variant="outline" className="flex-1" onClick={handleLock}>
					Lock
				</UiButton>
				<UiButton type="button" variant="destructive" className="flex-1" onClick={handleReset}>
					Reset
				</UiButton>
			</div>
		</main>
	);
}
