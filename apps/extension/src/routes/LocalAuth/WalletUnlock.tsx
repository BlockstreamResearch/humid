import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

import { walletVaultClient } from "@/core/secure-vault/application/wallet-vault/client";
import { UiButton } from "@/ui/UiButton/base";
import { UiField, UiFieldError, UiFieldLabel } from "@/ui/UiField";
import {
	UiInputGroup,
	UiInputGroupAddon,
	UiInputGroupButton,
	UiInputGroupInput,
} from "@/ui/UiInputGroup";

import humidMark from "../../../../../assets/brand/humid-mark.svg";

export type WalletUnlock = ReturnType<typeof useWalletUnlock>;

export function useWalletUnlock(onUnlocked?: () => void) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [passphrase, setPassphrase] = useState("");
	const mutation = useMutation({
		mutationFn: walletVaultClient.unlock,
		onSuccess: (status) => {
			if (!status.isUnlocked) return;
			setPassphrase("");
			onUnlocked?.();
		},
	});

	useEffect(() => {
		if (!mutation.isError) return;

		inputRef.current?.focus();
		inputRef.current?.select();
	}, [mutation.isError]);

	return {
		clearError: mutation.reset,
		error:
			mutation.isSuccess && !mutation.data.isUnlocked
				? "Could not unlock the wallet."
				: mutation.error?.message,
		inputRef,
		isFilled: passphrase.length > 0,
		isPending: mutation.isPending,
		passphrase,
		setPassphrase,
		submit: (event?: FormEvent) => {
			event?.preventDefault();
			if (passphrase.length === 0 || mutation.isPending) return;

			mutation.reset();
			mutation.mutate({ passphrase });
		},
	};
}

export function UnlockScreen({
	unlock,
	title,
	statement,
	disabled,
	onEdit,
	notices,
	secondary,
}: {
	unlock: WalletUnlock;
	title: string;
	statement: string;
	disabled: boolean;
	onEdit?: () => void;
	notices?: ReactNode;
	secondary?: ReactNode;
}) {
	return (
		<main className="flex size-full flex-col gap-4 p-5">
			<form className="flex flex-1 flex-col gap-4" onSubmit={unlock.submit}>
				<div className="flex flex-col items-center gap-3 pt-10 text-center">
					<img alt="Humid" className="mb-4 h-28" src={humidMark} />
					<h1 className="cn-font-heading text-2xl leading-tight font-semibold">{title}</h1>
					<p className="text-muted-foreground text-sm leading-6 text-balance">{statement}</p>
				</div>
				<PasswordField unlock={unlock} disabled={disabled} onEdit={onEdit} />
				{notices}
				<UiButton type="submit" size="lg" disabled={!unlock.isFilled || disabled}>
					{unlock.isPending ? "Unlocking…" : "Unlock"}
				</UiButton>
			</form>
			{secondary}
		</main>
	);
}

function PasswordField({
	unlock,
	disabled,
	onEdit,
}: {
	unlock: WalletUnlock;
	disabled: boolean;
	onEdit?: () => void;
}) {
	const [shown, setShown] = useState(false);
	const hasError = unlock.error !== undefined;

	return (
		<UiField data-invalid={hasError}>
			<UiFieldLabel htmlFor="unlock-password">Password</UiFieldLabel>
			<UiInputGroup className="h-11">
				<UiInputGroupInput
					ref={unlock.inputRef}
					id="unlock-password"
					aria-describedby={hasError ? "unlock-password-error" : undefined}
					aria-invalid={hasError}
					autoComplete="current-password"
					disabled={disabled}
					placeholder="Enter password"
					type={shown ? "text" : "password"}
					value={unlock.passphrase}
					onChange={(event) => {
						unlock.setPassphrase(event.target.value);
						unlock.clearError();
						onEdit?.();
					}}
				/>
				<UiInputGroupAddon align="inline-end">
					<UiInputGroupButton
						aria-label={shown ? "Hide password" : "Show password"}
						size="icon-sm"
						onClick={() => setShown(!shown)}
					>
						<HugeiconsIcon icon={shown ? ViewOffSlashIcon : ViewIcon} size={18} />
					</UiInputGroupButton>
				</UiInputGroupAddon>
			</UiInputGroup>
			<UiFieldError id="unlock-password-error">{unlock.error}</UiFieldError>
		</UiField>
	);
}
