import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { generateSeedMaterial } from "@/core/vault/secrets";
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

const createSeedMaterialFormSchema = z.object({
	seedMaterial: z.string().trim().min(1, "Enter seed material manually or generate it."),
});

type CreateSeedMaterialFormValues = z.infer<typeof createSeedMaterialFormSchema>;

export function AuthCreateSecretPage() {
	const navigate = useNavigate();
	const { seedMaterial, setSeedMaterial } = useAuthCreateContext();
	const {
		clearErrors,
		control,
		formState: { isValid },
		handleSubmit,
		setValue,
	} = useForm<CreateSeedMaterialFormValues>({
		defaultValues: { seedMaterial },
		mode: "onChange",
		reValidateMode: "onChange",
		resolver: zodResolver(createSeedMaterialFormSchema),
	});

	const handleGenerateSeedMaterial = () => {
		setValue("seedMaterial", generateSeedMaterial(), {
			shouldDirty: true,
			shouldTouch: true,
			shouldValidate: true,
		});
		clearErrors("seedMaterial");
	};

	const handleContinue = handleSubmit((values) => {
		setSeedMaterial(values.seedMaterial);
		void navigate({ to: "/auth/create/password" });
	});

	return (
		<main className="flex size-full flex-col gap-4 p-5">
			<form className="flex flex-1 flex-col justify-center gap-4" onSubmit={handleContinue}>
				<div className="flex flex-col gap-3">
					<p className="text-muted-foreground text-xs font-medium tracking-normal uppercase">
						Create · Step 1 of 2
					</p>
					<h1 className="cn-font-heading text-2xl leading-tight font-semibold">Root material</h1>
					<p className="text-muted-foreground text-sm leading-6">
						Use existing seed material or generate new local root material.
					</p>
				</div>

				<UiFieldGroup>
					<Controller
						name="seedMaterial"
						control={control}
						render={({ field, fieldState }) => {
							const descriptionId = "create-vault-seed-material-description";
							const errorId = "create-vault-seed-material-error";

							return (
								<UiField data-invalid={fieldState.invalid}>
									<UiFieldLabel htmlFor="create-vault-seed-material">Root material</UiFieldLabel>
									<UiTextarea
										{...field}
										id="create-vault-seed-material"
										aria-describedby={
											fieldState.error ? `${descriptionId} ${errorId}` : descriptionId
										}
										aria-invalid={fieldState.invalid}
										placeholder="Enter seed material manually"
									/>
									<UiFieldDescription id={descriptionId}>
										This becomes the first encrypted local-root keyring.
									</UiFieldDescription>
									<UiFieldError id={errorId} errors={[fieldState.error]} />
								</UiField>
							);
						}}
					/>

					<UiButton type="button" variant="outline" onClick={handleGenerateSeedMaterial}>
						Generate root material
					</UiButton>
				</UiFieldGroup>

				<UiButton type="submit" size="lg" disabled={!isValid}>
					Continue
				</UiButton>
			</form>
		</main>
	);
}
