import { type FormEvent, useEffect, useState } from "react";

import { UiButton } from "@/ui/UiButton/base";
import {
	UiDialog,
	UiDialogContent,
	UiDialogFooter,
	UiDialogHeader,
	UiDialogTitle,
} from "@/ui/UiDialog";
import { UiInput } from "@/ui/UiInput/base";

/**
 * Controlled dialog for renaming an account. Presentational: the caller owns the
 * mutation and passes `onSubmit`; the dialog only validates a trimmed, non-empty name.
 * Pass a `key` tied to the account so the input resets when the target changes.
 */
export function RenameAccountDialog({
	currentName,
	onOpenChange,
	onSubmit,
	open,
}: {
	currentName: string;
	onOpenChange: (open: boolean) => void;
	onSubmit: (name: string) => void;
	open: boolean;
}) {
	const [name, setName] = useState(currentName);

	useEffect(() => {
		if (open) setName(currentName);
	}, [currentName, open]);

	const trimmed = name.trim();

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();

		if (!trimmed) return;

		onSubmit(trimmed);
		onOpenChange(false);
	};

	return (
		<UiDialog onOpenChange={onOpenChange} open={open}>
			<UiDialogContent>
				<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
					<UiDialogHeader>
						<UiDialogTitle>Rename account</UiDialogTitle>
					</UiDialogHeader>
					<UiInput
						aria-label="Account name"
						maxLength={40}
						onChange={(event) => setName(event.target.value)}
						placeholder="Account name"
						value={name}
					/>
					<UiDialogFooter>
						<UiButton onClick={() => onOpenChange(false)} type="button" variant="outline">
							Cancel
						</UiButton>
						<UiButton disabled={!trimmed} type="submit">
							Save
						</UiButton>
					</UiDialogFooter>
				</form>
			</UiDialogContent>
		</UiDialog>
	);
}
