import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { walletVaultClient } from "@/core/secure-vault/application/wallet-vault/client";
import { UiButton } from "@/ui/UiButton/base";
import { UiField, UiFieldError, UiFieldLabel } from "@/ui/UiField";
import { UiInput } from "@/ui/UiInput/base";

type Props = {
	children: ReactNode;
	onUnlocked: () => void;
	secondaryAction: { label: string; onClick: () => void };
	disabled?: boolean;
	feedback?: ReactNode;
	onPasswordChange?: () => void;
	layout?: "page" | "dialog";
};

export function WalletUnlockForm({
	children,
	onUnlocked,
	secondaryAction,
	disabled = false,
	feedback,
	onPasswordChange,
	layout = "dialog",
}: Props) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [passphrase, setPassphrase] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const busy = pending || disabled;

	useEffect(() => {
		if (!error || busy) return;
		inputRef.current?.focus();
		inputRef.current?.select();
	}, [error, busy]);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		if (!passphrase || busy) return;

		setPending(true);
		setError(null);
		onPasswordChange?.();

		try {
			const status = await walletVaultClient.unlock({ passphrase });
			if (status.isUnlocked) {
				setPassphrase("");
				onUnlocked();
			} else {
				setError("Could not unlock the wallet.");
			}
		} catch (unlockError) {
			setError(unlockError instanceof Error ? unlockError.message : String(unlockError));
		} finally {
			setPending(false);
		}
	};

	const content = (
		<>
			{children}
			<UiField data-invalid={Boolean(error)}>
				<UiFieldLabel htmlFor="wallet-unlock-password">Password</UiFieldLabel>
				<UiInput
					ref={inputRef}
					id="wallet-unlock-password"
					aria-describedby={error ? "wallet-unlock-password-error" : undefined}
					aria-invalid={Boolean(error)}
					type="password"
					autoComplete="current-password"
					disabled={busy}
					placeholder="Enter passphrase"
					value={passphrase}
					onChange={(event) => {
						setPassphrase(event.target.value);
						setError(null);
						onPasswordChange?.();
					}}
				/>
				<UiFieldError id="wallet-unlock-password-error">{error}</UiFieldError>
			</UiField>
			{feedback}
		</>
	);
	const secondaryButton = (
		<UiButton
			type="button"
			variant="outline"
			className={layout === "dialog" ? "flex-1" : undefined}
			disabled={busy}
			onClick={() => {
				setError(null);
				secondaryAction.onClick();
			}}
		>
			{secondaryAction.label}
		</UiButton>
	);
	const unlockButton = (
		<UiButton
			type="submit"
			size={layout === "page" ? "lg" : undefined}
			className={layout === "dialog" ? "flex-1" : undefined}
			disabled={!passphrase || busy}
		>
			{pending ? "Unlocking…" : "Unlock"}
		</UiButton>
	);

	return (
		<form className="flex flex-1 flex-col gap-4" onSubmit={handleSubmit}>
			{layout === "page" ? (
				<>
					<div className="flex flex-1 flex-col justify-center gap-4">
						{content}
						{unlockButton}
					</div>
					{secondaryButton}
				</>
			) : (
				<>
					{content}
					<div className="mt-auto flex items-center gap-3 py-4">
						{secondaryButton}
						{unlockButton}
					</div>
				</>
			)}
		</form>
	);
}
