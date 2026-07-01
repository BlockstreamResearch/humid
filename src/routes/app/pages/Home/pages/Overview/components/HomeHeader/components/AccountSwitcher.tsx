import { type FormEvent, useEffect, useState } from "react";

import { useHome } from "@/routes/App/pages/Home/HomeContext";
import { UiButton } from "@/ui/UiButton/base";
import {
	UiDialog,
	UiDialogContent,
	UiDialogFooter,
	UiDialogHeader,
	UiDialogTitle,
} from "@/ui/UiDialog";
import {
	UiDropdownMenu,
	UiDropdownMenuContent,
	UiDropdownMenuItem,
	UiDropdownMenuRadioGroup,
	UiDropdownMenuRadioItem,
	UiDropdownMenuSeparator,
	UiDropdownMenuTrigger,
} from "@/ui/UiDropdownMenu";
import { UiInput } from "@/ui/UiInput/base";

import { AccountAvatar } from "./AccountAvatar";

/**
 * Account switcher — the trigger opens the list of account groups. Selecting one
 * re-resolves the chain account for the current chain; "Rename account" edits the
 * selected group's display name. No chain-specific logic.
 */
export function AccountSwitcher() {
	const { accountGroup, accountGroups, renameAccount, selectAccount } = useHome();
	const [renameOpen, setRenameOpen] = useState(false);

	return (
		<>
			<UiDropdownMenu>
				<UiDropdownMenuTrigger
					aria-label="Switch account"
					className="hover:bg-accent focus-visible:ring-ring flex items-center gap-2 rounded-full py-1 pr-1 pl-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
				>
					<span className="text-sm font-medium">{accountGroup.name}</span>
					<AccountAvatar seed={accountGroup.id} />
				</UiDropdownMenuTrigger>
				<UiDropdownMenuContent align="end" className="min-w-48">
					<UiDropdownMenuRadioGroup value={accountGroup.id} onValueChange={selectAccount}>
						{accountGroups.map((group) => (
							<UiDropdownMenuRadioItem
								key={group.id}
								closeOnClick
								value={group.id}
								className="gap-2"
							>
								<AccountAvatar seed={group.id} className="size-5" />
								{group.name}
							</UiDropdownMenuRadioItem>
						))}
					</UiDropdownMenuRadioGroup>
					<UiDropdownMenuSeparator />
					<UiDropdownMenuItem onClick={() => setRenameOpen(true)}>
						Rename account
					</UiDropdownMenuItem>
				</UiDropdownMenuContent>
			</UiDropdownMenu>
			<RenameAccountDialog
				key={accountGroup.id}
				currentName={accountGroup.name}
				onOpenChange={setRenameOpen}
				onSubmit={(name) => renameAccount({ accountGroupId: accountGroup.id, name })}
				open={renameOpen}
			/>
		</>
	);
}

/** Controlled rename dialog for the selected account; submits a trimmed, non-empty name. */
function RenameAccountDialog({
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
		<UiDialog open={open} onOpenChange={onOpenChange}>
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
