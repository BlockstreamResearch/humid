import { useState } from "react";

import { AccountAvatar } from "@/routes/App/components/AccountAvatar";
import { RenameAccountDialog } from "@/routes/App/components/RenameAccountDialog";
import { useHome } from "@/routes/App/pages/Home/HomeContext";
import {
	UiDropdownMenu,
	UiDropdownMenuContent,
	UiDropdownMenuItem,
	UiDropdownMenuRadioGroup,
	UiDropdownMenuRadioItem,
	UiDropdownMenuSeparator,
	UiDropdownMenuTrigger,
} from "@/ui/UiDropdownMenu";

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
