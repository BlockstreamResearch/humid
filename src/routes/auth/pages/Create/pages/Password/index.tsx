import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { createVault } from "@/core/vault";
import { UiButton } from "@/ui/UiButton/base";
import {
	UiField,
	UiFieldDescription,
	UiFieldError,
	UiFieldGroup,
	UiFieldLabel,
} from "@/ui/UiField";
import { UiInput } from "@/ui/UiInput/base";

import { useAuthCreateContext } from "../../index";

const createPasswordFormSchema = z
	.object({
		passphrase: z
			.string()
			.min(1, "Create a password.")
			.min(8, "Password must be at least 8 characters."),
		confirmPassphrase: z.string().min(1, "Repeat your password."),
	})
	.refine(({ confirmPassphrase, passphrase }) => confirmPassphrase === passphrase, {
		message: "Passwords do not match.",
		path: ["confirmPassphrase"],
	});

type CreatePasswordFormValues = z.infer<typeof createPasswordFormSchema>;

const DEFAULT_FORM_VALUES: CreatePasswordFormValues = {
	passphrase: "",
	confirmPassphrase: "",
};

export function AuthCreatePasswordPage() {
	const navigate = useNavigate();
	const { secret } = useAuthCreateContext();
	const {
		control,
		formState: { isValid },
		handleSubmit,
		reset,
		trigger,
		watch,
	} = useForm<CreatePasswordFormValues>({
		defaultValues: DEFAULT_FORM_VALUES,
		mode: "onChange",
		reValidateMode: "onChange",
		resolver: zodResolver(createPasswordFormSchema),
	});

	const confirmPassphraseValue = watch("confirmPassphrase");
	const createVaultMutation = useMutation({
		mutationFn: (values: CreatePasswordFormValues) =>
			createVault({ secret, passphrase: values.passphrase }),
		onSuccess: () => {
			reset(DEFAULT_FORM_VALUES);
			void navigate({ to: "/app" });
		},
	});
	const canSubmit = isValid && !createVaultMutation.isPending;

	const clearFormError = () => {
		createVaultMutation.reset();
	};

	const handleCreateVault = handleSubmit((values) => {
		if (createVaultMutation.isPending) return;

		clearFormError();
		createVaultMutation.mutate(values);
	});

	if (!secret) {
		return <Navigate replace to="/auth/create" />;
	}

	return (
		<main className="flex size-full flex-col gap-4 p-5">
			<form className="flex flex-1 flex-col justify-center gap-4" onSubmit={handleCreateVault}>
				<div className="flex flex-col gap-3">
					<p className="text-muted-foreground text-xs font-medium tracking-normal uppercase">
						Create · Step 2 of 2
					</p>
					<h1 className="cn-font-heading text-2xl leading-tight font-semibold">Password</h1>
					<p className="text-muted-foreground text-sm leading-6">
						Protect your vault with a password. It is required to unlock this device.
					</p>
				</div>

				<UiFieldGroup>
					<Controller
						name="passphrase"
						control={control}
						render={({ field, fieldState }) => {
							const descriptionId = "create-vault-passphrase-description";
							const errorId = "create-vault-passphrase-error";

							return (
								<UiField data-invalid={fieldState.invalid}>
									<UiFieldLabel htmlFor="create-vault-passphrase">Password</UiFieldLabel>
									<UiInput
										{...field}
										id="create-vault-passphrase"
										aria-describedby={
											fieldState.error ? `${descriptionId} ${errorId}` : descriptionId
										}
										aria-invalid={fieldState.invalid}
										autoComplete="new-password"
										disabled={createVaultMutation.isPending}
										placeholder="Create password"
										type="password"
										onChange={(event) => {
											field.onChange(event);
											clearFormError();

											if (confirmPassphraseValue) {
												void trigger("confirmPassphrase");
											}
										}}
									/>
									<UiFieldDescription id={descriptionId}>
										Minimum 8 characters. It is required to unlock this device.
									</UiFieldDescription>
									<UiFieldError id={errorId} errors={[fieldState.error]} />
								</UiField>
							);
						}}
					/>

					<Controller
						name="confirmPassphrase"
						control={control}
						render={({ field, fieldState }) => {
							const errorId = "create-vault-confirm-passphrase-error";

							return (
								<UiField data-invalid={fieldState.invalid}>
									<UiFieldLabel htmlFor="create-vault-confirm-passphrase">
										Confirm password
									</UiFieldLabel>
									<UiInput
										{...field}
										id="create-vault-confirm-passphrase"
										aria-describedby={fieldState.error ? errorId : undefined}
										aria-invalid={fieldState.invalid}
										autoComplete="new-password"
										disabled={createVaultMutation.isPending}
										placeholder="Repeat password"
										type="password"
										onChange={(event) => {
											field.onChange(event);
											clearFormError();
										}}
									/>
									<UiFieldError id={errorId} errors={[fieldState.error]} />
								</UiField>
							);
						}}
					/>
				</UiFieldGroup>

				<UiFieldError>
					{createVaultMutation.error instanceof Error
						? createVaultMutation.error.message
						: String(createVaultMutation.error ?? "")}
				</UiFieldError>

				<div className="flex flex-col gap-2">
					<UiButton type="submit" size="lg" disabled={!canSubmit}>
						{createVaultMutation.isPending ? "Creating..." : "Create vault"}
					</UiButton>
					<UiButton
						type="button"
						variant="ghost"
						disabled={createVaultMutation.isPending}
						onClick={() => void navigate({ to: "/auth/create" })}
					>
						Back
					</UiButton>
				</div>
			</form>
		</main>
	);
}
