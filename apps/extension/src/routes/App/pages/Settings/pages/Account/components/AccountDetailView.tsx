import {
	ArrowLeft01Icon,
	Delete01Icon,
	Key01Icon,
	PencilEdit01Icon,
	PlugSocketIcon,
	Shield01Icon,
	WalletRemove01Icon,
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
import { UiButton } from "@/ui/UiButton/base";
import {
	UiDialog,
	UiDialogContent,
	UiDialogDescription,
	UiDialogFooter,
	UiDialogHeader,
	UiDialogTitle,
} from "@/ui/UiDialog";
import { UiScrollArea } from "@/ui/UiScrollArea";

import { ContractIdentityRow } from "./ContractIdentityRow";

type AccountDetailViewProps = {
	accountGroupId: AccountGroupId;
	accountName: string;
	canForgetWallet: boolean;
	forgetError: string | null;
	isForgetting: boolean;
	isRemoving: boolean;
	onForgetWallet: () => void;
	onRemove: () => void;
	onRename: (name: string) => void;
	removeError: string | null;
};

/** Per-account settings: breadcrumb header + the account actions (rename, remove, forget wallet). */
export function AccountDetailView({
	accountGroupId,
	accountName,
	canForgetWallet,
	forgetError,
	isForgetting,
	isRemoving,
	onForgetWallet,
	onRemove,
	onRename,
	removeError,
}: AccountDetailViewProps) {
	const [renameOpen, setRenameOpen] = useState(false);
	const [removeOpen, setRemoveOpen] = useState(false);
	const [forgetOpen, setForgetOpen] = useState(false);

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
					<Link
						className={cn(settingsRowClass, "hover:bg-accent")}
						params={{ accountGroupId }}
						to="/app/settings/account/$accountGroupId/connected-dapps"
					>
						<SettingsRowContent icon={PlugSocketIcon} label="Connected dapps" />
					</Link>
					<ContractIdentityRow />
					<button
						className={cn(settingsRowClass, "text-destructive hover:bg-destructive/10")}
						onClick={() => setRemoveOpen(true)}
						type="button"
					>
						<HugeiconsIcon className="shrink-0" icon={Delete01Icon} size={18} />
						<span className="flex-1 text-sm font-medium">Remove account</span>
					</button>
					{canForgetWallet ? (
						<button
							className={cn(settingsRowClass, "text-destructive hover:bg-destructive/10")}
							onClick={() => setForgetOpen(true)}
							type="button"
						>
							<HugeiconsIcon className="shrink-0" icon={WalletRemove01Icon} size={18} />
							<span className="flex-1 text-sm font-medium">Forget wallet</span>
						</button>
					) : null}
				</div>
			</UiScrollArea>

			<RenameAccountDialog
				currentName={accountName}
				onOpenChange={setRenameOpen}
				onSubmit={onRename}
				open={renameOpen}
			/>

			<UiDialog onOpenChange={setRemoveOpen} open={removeOpen}>
				<UiDialogContent>
					<UiDialogHeader>
						<UiDialogTitle>Remove account?</UiDialogTitle>
						<UiDialogDescription>
							This removes &ldquo;{accountName}&rdquo; from this wallet. Its funds stay recoverable
							from your recovery phrase.
						</UiDialogDescription>
					</UiDialogHeader>
					{removeError ? <p className="text-destructive text-sm">{removeError}</p> : null}
					<UiDialogFooter>
						<UiButton onClick={() => setRemoveOpen(false)} type="button" variant="outline">
							Cancel
						</UiButton>
						<UiButton disabled={isRemoving} onClick={onRemove} type="button" variant="destructive">
							{isRemoving ? "Removing…" : "Remove"}
						</UiButton>
					</UiDialogFooter>
				</UiDialogContent>
			</UiDialog>

			<UiDialog onOpenChange={setForgetOpen} open={forgetOpen}>
				<UiDialogContent>
					<UiDialogHeader>
						<UiDialogTitle>Forget this wallet?</UiDialogTitle>
						<UiDialogDescription>
							This permanently removes every account under this wallet and erases its recovery
							phrase from this device. You can only restore access by re-importing the recovery
							phrase — make sure you have it saved.
						</UiDialogDescription>
					</UiDialogHeader>
					{forgetError ? <p className="text-destructive text-sm">{forgetError}</p> : null}
					<UiDialogFooter>
						<UiButton onClick={() => setForgetOpen(false)} type="button" variant="outline">
							Cancel
						</UiButton>
						<UiButton
							disabled={isForgetting}
							onClick={onForgetWallet}
							type="button"
							variant="destructive"
						>
							{isForgetting ? "Forgetting…" : "Forget wallet"}
						</UiButton>
					</UiDialogFooter>
				</UiDialogContent>
			</UiDialog>
		</div>
	);
}
