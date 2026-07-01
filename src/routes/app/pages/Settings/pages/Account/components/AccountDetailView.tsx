import {
	ArrowLeft01Icon,
	Delete01Icon,
	Key01Icon,
	PencilEdit01Icon,
	Shield01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import { AccountAvatar } from "@/routes/App/components/AccountAvatar";
import { RenameAccountDialog } from "@/routes/App/components/RenameAccountDialog";
import {
	settingsRowClass,
	SettingsRowContent,
	SettingsRowSoon,
} from "@/routes/App/pages/Settings/components/SettingsRow";
import { cn } from "@/theme/utils.ts";
import { UiScrollArea } from "@/ui/UiScrollArea";

type AccountDetailViewProps = {
	accountGroupId: AccountGroupId;
	accountName: string;
	onRename: (name: string) => void;
};

/** Per-account settings: breadcrumb header + the account actions (rename now; rest pending). */
export function AccountDetailView({
	accountGroupId,
	accountName,
	onRename,
}: AccountDetailViewProps) {
	const [renameOpen, setRenameOpen] = useState(false);

	return (
		<div className="flex size-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-3 py-3">
				<Link
					aria-label="Back to settings"
					className="text-muted-foreground hover:text-foreground shrink-0"
					to="/app/settings"
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
				</Link>
				<Link
					className="text-muted-foreground hover:text-foreground shrink-0 text-sm"
					to="/app/settings"
				>
					Settings
				</Link>
				<span className="text-muted-foreground/50 shrink-0 text-sm">/</span>
				<AccountAvatar className="size-5 shrink-0" seed={accountGroupId} />
				<span className="truncate text-sm font-semibold">{accountName}</span>
			</header>
			<UiScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col px-3 py-4">
					<button
						className={cn(settingsRowClass, "hover:bg-accent")}
						onClick={() => setRenameOpen(true)}
						type="button"
					>
						<SettingsRowContent icon={PencilEdit01Icon} label="Edit name" />
					</button>
					<div className={cn(settingsRowClass, "opacity-50")}>
						<SettingsRowContent
							icon={Key01Icon}
							label="Export private key"
							trailing={<SettingsRowSoon />}
						/>
					</div>
					<Link
						className={cn(settingsRowClass, "hover:bg-accent")}
						params={{ accountGroupId }}
						to="/app/settings/account/$accountGroupId/recovery-phrase"
					>
						<SettingsRowContent icon={Shield01Icon} label="Reveal recovery phrase" />
					</Link>
					<div className={cn(settingsRowClass, "opacity-50")}>
						<SettingsRowContent
							icon={Delete01Icon}
							label="Remove account"
							trailing={<SettingsRowSoon />}
						/>
					</div>
				</div>
			</UiScrollArea>
			<RenameAccountDialog
				currentName={accountName}
				onOpenChange={setRenameOpen}
				onSubmit={onRename}
				open={renameOpen}
			/>
		</div>
	);
}
