import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { generateSecret } from "@/core/vault";
import { UiButton } from "@/ui/UiButton/base";
import {
	UiField,
	UiFieldDescription,
	UiFieldError,
	UiFieldGroup,
	UiFieldLabel,
} from "@/ui/UiField";
import { UiTextarea } from "@/ui/UiTextarea/base";

import { useAuthCreateContext } from "../../index";

const createSecretFormSchema = z.object({
	secret: z.string().trim().min(1, "Enter a secret manually or generate one."),
});

type CreateSecretFormValues = z.infer<typeof createSecretFormSchema>;

export function AuthCreateSecretPage() {
	const navigate = useNavigate();
	const { secret, setSecret } = useAuthCreateContext();
	const {
		clearErrors,
		control,
		formState: { isValid },
		handleSubmit,
		setValue,
	} = useForm<CreateSecretFormValues>({
		defaultValues: { secret },
		mode: "onChange",
		reValidateMode: "onChange",
		resolver: zodResolver(createSecretFormSchema),
	});

	const handleGenerateSecret = () => {
		setValue("secret", generateSecret(), {
			shouldDirty: true,
			shouldTouch: true,
			shouldValidate: true,
		});
		clearErrors("secret");
	};

	const handleContinue = handleSubmit((values) => {
		setSecret(values.secret);
		void navigate({ to: "/auth/create/password" });
	});

	return (
		<main className="flex size-full flex-col gap-4 p-5">
			<form className="flex flex-1 flex-col justify-center gap-4" onSubmit={handleContinue}>
				<div className="flex flex-col gap-3">
					<p className="text-muted-foreground text-xs font-medium tracking-normal uppercase">
						Create · Step 1 of 2
					</p>
					<h1 className="cn-font-heading text-2xl leading-tight font-semibold">Secret key</h1>
					<p className="text-muted-foreground text-sm leading-6">
						Use an existing secret or generate a new one locally.
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
										placeholder="Enter secret manually"
									/>
									<UiFieldDescription id={descriptionId}>
										Use an existing secret or generate a new one locally.
									</UiFieldDescription>
									<UiFieldError id={errorId} errors={[fieldState.error]} />
								</UiField>
							);
						}}
					/>

					<UiButton type="button" variant="outline" onClick={handleGenerateSecret}>
						Generate secret
					</UiButton>
				</UiFieldGroup>

				<UiButton type="submit" size="lg" disabled={!isValid}>
					Continue
				</UiButton>
			</form>
		</main>
	);
}
