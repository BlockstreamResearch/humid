import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { useConfirm } from "@/common/Confirmation";
import { walletVaultClient } from "@/core/secure-vault/application/wallet-vault/client";
import { UiButton } from "@/ui/UiButton/base";
import { UiField, UiFieldError, UiFieldGroup, UiFieldLabel } from "@/ui/UiField";
import { UiInput } from "@/ui/UiInput/base";

const localAuthFormSchema = z.object({
	passphrase: z.string().min(1, "Enter your password to unlock the vault."),
});

type LocalAuthFormValues = z.infer<typeof localAuthFormSchema>;

const DEFAULT_FORM_VALUES: LocalAuthFormValues = {
	passphrase: "",
};

function getErrorMessage(error: unknown): string | null {
	if (!error) return null;

	return error instanceof Error ? error.message : String(error);
}

export function LocalAuthPage() {
	const navigate = useNavigate();
	const confirm = useConfirm();
	const passphraseInputRef = useRef<HTMLInputElement | null>(null);
	const [resetNotice, setResetNotice] = useState<string | null>(null);
	const {
		control,
		formState: { isValid },
		handleSubmit,
		reset,
	} = useForm<LocalAuthFormValues>({
		defaultValues: DEFAULT_FORM_VALUES,
		mode: "onChange",
		reValidateMode: "onChange",
		resolver: zodResolver(localAuthFormSchema),
	});

	const unlockVaultMutation = useMutation({
		mutationFn: walletVaultClient.unlock,
		onError: () => {
			passphraseInputRef.current?.focus();
			passphraseInputRef.current?.select();
		},
		onSuccess: () => {
			reset(DEFAULT_FORM_VALUES);
			void navigate({ to: "/app" });
		},
	});
	const resetVaultMutation = useMutation({
		mutationFn: walletVaultClient.reset,
		onSuccess: (status) => {
			if (!status.hasVault) {
				void navigate({ to: "/auth/intro" });
			}
		},
	});
	const unlockErrorMessage = getErrorMessage(unlockVaultMutation.error);
	const resetErrorMessage = getErrorMessage(resetVaultMutation.error);
	const isMutating = unlockVaultMutation.isPending || resetVaultMutation.isPending;
	const canSubmit = isValid && !isMutating;

	const clearFeedback = () => {
		setResetNotice(null);
		unlockVaultMutation.reset();
		resetVaultMutation.reset();
	};

	const handleUnlock = handleSubmit((values) => {
		if (isMutating) return;

		clearFeedback();
		unlockVaultMutation.mutate(values);
	});

	const handleReset = async () => {
		if (isMutating) return;

		clearFeedback();

		const { approved } = await confirm({
			title: "Reset local vault?",
			message: "This will remove the encrypted vault from this browser profile.",
		});

		if (!approved) {
			setResetNotice("Reset cancelled. Your encrypted vault is still on this device.");
			return;
		}

		resetVaultMutation.mutate();
	};

	return (
		<main className="flex size-full flex-col gap-4 p-5">
			<form className="flex flex-1 flex-col justify-center gap-4" onSubmit={handleUnlock}>
				<div className="flex flex-col gap-3">
					<p className="text-muted-foreground text-xs font-medium tracking-normal uppercase">
						Locked
					</p>
					<h1 className="cn-font-heading text-2xl leading-tight font-semibold">Unlock Humid</h1>
					<p className="text-muted-foreground text-sm leading-6">
						A local vault exists. Unlock it to continue to the app area.
					</p>
				</div>

				<UiFieldGroup>
					<Controller
						name="passphrase"
						control={control}
						render={({ field, fieldState }) => {
							const errorId = "local-auth-password-error";
							const hasError = fieldState.invalid || Boolean(unlockErrorMessage);

							return (
								<UiField data-invalid={hasError}>
									<UiFieldLabel htmlFor="local-auth-password">Password</UiFieldLabel>
									<UiInput
										{...field}
										ref={(element) => {
											field.ref(element);
											passphraseInputRef.current = element;
										}}
										id="local-auth-password"
										aria-describedby={hasError ? errorId : undefined}
										aria-invalid={hasError}
										autoComplete="current-password"
										disabled={isMutating}
										placeholder="Enter passphrase"
										type="password"
										onChange={(event) => {
											field.onChange(event);
											clearFeedback();
										}}
									/>
									<UiFieldError
										id={errorId}
										errors={[
											fieldState.error,
											unlockErrorMessage ? { message: unlockErrorMessage } : undefined,
										]}
									/>
								</UiField>
							);
						}}
					/>
				</UiFieldGroup>

				<UiFieldError>{resetErrorMessage}</UiFieldError>

				{resetNotice && <p className="text-muted-foreground text-sm leading-5">{resetNotice}</p>}

				<UiButton type="submit" size="lg" disabled={!canSubmit}>
					{unlockVaultMutation.isPending ? "Unlocking..." : "Unlock"}
				</UiButton>
			</form>

			<UiButton type="button" variant="outline" disabled={isMutating} onClick={handleReset}>
				{resetVaultMutation.isPending ? "Resetting..." : "Reset local vault"}
			</UiButton>
		</main>
	);
}
