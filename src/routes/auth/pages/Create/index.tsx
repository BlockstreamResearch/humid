import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { createVault, generateSecret } from "@/core/vault";
import { UiButton } from "@/ui/UiButton/base";
import {
	UiField,
	UiFieldDescription,
	UiFieldError,
	UiFieldGroup,
	UiFieldLabel,
} from "@/ui/UiField";
import { UiInput } from "@/ui/UiInput/base";
import { UiTextarea } from "@/ui/UiTextarea/base";

const createVaultFormSchema = z
	.object({
		secret: z.string().trim().min(1, "Enter a secret manually or generate one."),
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

type CreateVaultFormValues = z.infer<typeof createVaultFormSchema>;

const DEFAULT_FORM_VALUES: CreateVaultFormValues = {
	secret: "",
	passphrase: "",
	confirmPassphrase: "",
};

export function AuthCreatePage() {
	const navigate = useNavigate();
	const {
		clearErrors,
		control,
		formState: { isValid },
		handleSubmit,
		reset,
		setValue,
		trigger,
		watch,
	} = useForm<CreateVaultFormValues>({
		defaultValues: DEFAULT_FORM_VALUES,
		mode: "onChange",
		reValidateMode: "onChange",
		resolver: zodResolver(createVaultFormSchema),
	});

	const confirmPassphraseValue = watch("confirmPassphrase");
	const createVaultMutation = useMutation({
		mutationFn: (values: CreateVaultFormValues) =>
			createVault({
				secret: values.secret,
				passphrase: values.passphrase,
			}),
		onSuccess: () => {
			reset(DEFAULT_FORM_VALUES);
			void navigate({ to: "/app" });
		},
	});
	const canSubmit = isValid && !createVaultMutation.isPending;

	const clearFormError = () => {
		createVaultMutation.reset();
	};

	const handleGenerateSecret = () => {
		setValue("secret", generateSecret(), {
			shouldDirty: true,
			shouldTouch: true,
			shouldValidate: true,
		});
		clearErrors("secret");
		clearFormError();
	};

	const handleCreateVault = handleSubmit((values) => {
		if (createVaultMutation.isPending) return;

		clearFormError();
		createVaultMutation.mutate(values);
	});

	return (
		<main className="flex size-full flex-col gap-4 p-5">
			<form className="flex flex-1 flex-col justify-center gap-4" onSubmit={handleCreateVault}>
				<div className="flex flex-col gap-3">
					<p className="text-muted-foreground text-xs font-medium tracking-normal uppercase">
						Create
					</p>
					<h1 className="cn-font-heading text-2xl leading-tight font-semibold">Secret key</h1>
					<p className="text-muted-foreground text-sm leading-6">
						Create a local encrypted vault protected by a password.
					</p>
				</div>

				<UiFieldGroup>
					<Controller
						name="secret"
						control={control}
						render={({ field, fieldState }) => {
							const descriptionId = "create-vault-secret-description";
							const errorId = "create-vault-secret-error";

							return (
								<UiField data-invalid={fieldState.invalid}>
									<UiFieldLabel htmlFor="create-vault-secret">Secret</UiFieldLabel>
									<UiTextarea
										{...field}
										id="create-vault-secret"
										aria-describedby={
											fieldState.error ? `${descriptionId} ${errorId}` : descriptionId
										}
										aria-invalid={fieldState.invalid}
										disabled={createVaultMutation.isPending}
										placeholder="Enter secret manually"
										onChange={(event) => {
											field.onChange(event);
											clearFormError();
										}}
									/>
									<UiFieldDescription id={descriptionId}>
										Use an existing secret or generate a new one locally.
									</UiFieldDescription>
									<UiFieldError id={errorId} errors={[fieldState.error]} />
								</UiField>
							);
						}}
					/>

					<UiButton
						type="button"
						variant="outline"
						disabled={createVaultMutation.isPending}
						onClick={handleGenerateSecret}
					>
						Generate secret
					</UiButton>

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

				<UiButton type="submit" size="lg" disabled={!canSubmit}>
					{createVaultMutation.isPending ? "Creating..." : "Create vault"}
				</UiButton>
			</form>
		</main>
	);
}
