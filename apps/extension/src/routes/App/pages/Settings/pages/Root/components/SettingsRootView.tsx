import {
	Add01Icon,
	ArrowRight01Icon,
	GlobalIcon,
	PaintBoardIcon,
	ShieldKeyIcon,
	SquareLock01Icon,
	Timer02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import { Page } from "@/common/Page";
import type { AccountGroupRecord } from "@/core/accounts/application/account-registry/model/account-group";
import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import { AccountAvatar } from "@/routes/App/components/AccountAvatar";
import { SettingsRowSoon } from "@/routes/App/pages/Settings/components/SettingsRow";
import { UiBadge } from "@/ui/UiBadge";
import { UiButton } from "@/ui/UiButton/base";
import {
	UiSelect,
	UiSelectContent,
	UiSelectItem,
	UiSelectTrigger,
	UiSelectValue,
} from "@/ui/UiSelect/base";

const AUTO_LOCK_OPTIONS: { label: string; minutes: number }[] = [
	{ label: "5 minutes", minutes: 5 },
	{ label: "15 minutes", minutes: 15 },
	{ label: "30 minutes", minutes: 30 },
	{ label: "1 hour", minutes: 60 },
	{ label: "Never (until browser close)", minutes: 0 },
];

type SettingsRootViewProps = {
	accountGroups: AccountGroupRecord[];
	autoLockMinutes: number;
	isLocking: boolean;
	onAutoLockChange: (minutes: number) => void;
	onLock: () => void;
	onSwitch: (accountGroupId: AccountGroupId) => void;
	selectedAccountGroupId: AccountGroupId | null;
};

export function SettingsRootView({
	accountGroups,
	autoLockMinutes,
	isLocking,
	onAutoLockChange,
	onLock,
	onSwitch,
	selectedAccountGroupId,
}: SettingsRootViewProps) {
	return (
		<Page title="Settings">
			<div className="flex flex-col gap-6 px-3 py-4">
				<section className="flex flex-col">
					<button
						className="hover:bg-accent flex items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors disabled:opacity-60"
						disabled={isLocking}
						onClick={onLock}
						type="button"
					>
						<HugeiconsIcon className="text-muted-foreground" icon={SquareLock01Icon} size={18} />
						<span className="flex-1 text-sm font-medium">Lock wallet</span>
					</button>
					<div className="flex items-center gap-3 rounded-lg px-2 py-1">
						<HugeiconsIcon className="text-muted-foreground" icon={Timer02Icon} size={18} />
						<label className="flex-1 text-sm font-medium" htmlFor="settings-auto-lock">
							Auto-lock
						</label>
						<UiSelect
							items={AUTO_LOCK_OPTIONS.map(({ label, minutes }) => ({ label, value: minutes }))}
							value={autoLockMinutes}
							onValueChange={(minutes) => onAutoLockChange(minutes as number)}
						>
							<UiSelectTrigger id="settings-auto-lock">
								<UiSelectValue />
							</UiSelectTrigger>
							<UiSelectContent align="end" alignItemWithTrigger={false} className="w-auto">
								{AUTO_LOCK_OPTIONS.map((option) => (
									<UiSelectItem key={option.minutes} value={option.minutes}>
										{option.label}
									</UiSelectItem>
								))}
							</UiSelectContent>
						</UiSelect>
					</div>
					<Link
						className="hover:bg-accent flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors"
						to="/app/settings/chains"
					>
						<HugeiconsIcon className="text-muted-foreground" icon={GlobalIcon} size={18} />
						<span className="flex-1 text-sm font-medium">Networks</span>
						<HugeiconsIcon className="text-muted-foreground/60" icon={ArrowRight01Icon} size={16} />
					</Link>
					<Link
						className="hover:bg-accent flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors"
						to="/app/settings/theme"
					>
						<HugeiconsIcon className="text-muted-foreground" icon={PaintBoardIcon} size={18} />
						<span className="flex-1 text-sm font-medium">Theme</span>
						<HugeiconsIcon className="text-muted-foreground/60" icon={ArrowRight01Icon} size={16} />
					</Link>
					<DisabledRow icon={ShieldKeyIcon} label="Change password" />
				</section>

				<section className="flex flex-col gap-1">
					<div className="flex items-center justify-between px-2">
						<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
							Accounts
						</p>
						<Link
							className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium"
							to="/app/settings/add-account"
						>
							<HugeiconsIcon icon={Add01Icon} size={14} />
							Add
						</Link>
					</div>
					<div className="flex flex-col">
						{accountGroups.map((group) => (
							<AccountRow
								key={group.id}
								group={group}
								onSwitch={onSwitch}
								selected={group.id === selectedAccountGroupId}
							/>
						))}
					</div>
				</section>
			</div>
		</Page>
	);
}

function AccountRow({
	group,
	onSwitch,
	selected,
}: {
	group: AccountGroupRecord;
	onSwitch: (accountGroupId: AccountGroupId) => void;
	selected: boolean;
}) {
	const isImported = group.metadata?.imported === true;

	return (
		<div className="hover:bg-accent flex items-center gap-2 rounded-lg px-2 py-2 transition-colors">
			<Link
				className="flex min-w-0 flex-1 items-center gap-3"
				params={{ accountGroupId: group.id }}
				to="/app/settings/account/$accountGroupId"
			>
				<AccountAvatar className="size-8" seed={group.id} />
				<span className="truncate text-sm font-medium">{group.name}</span>
				{isImported ? (
					<UiBadge className="shrink-0" variant="secondary">
						Imported
					</UiBadge>
				) : null}
			</Link>
			{selected ? (
				<span aria-label="Selected" className="size-2 shrink-0 rounded-full bg-emerald-500" />
			) : (
				<UiButton onClick={() => onSwitch(group.id)} size="sm" type="button" variant="outline">
					Switch
				</UiButton>
			)}
			<Link
				aria-label={`Open ${group.name} settings`}
				className="text-muted-foreground/70"
				params={{ accountGroupId: group.id }}
				to="/app/settings/account/$accountGroupId"
			>
				<HugeiconsIcon icon={ArrowRight01Icon} size={16} />
			</Link>
		</div>
	);
}

function DisabledRow({
	icon,
	label,
}: {
	icon: ComponentProps<typeof HugeiconsIcon>["icon"];
	label: string;
}) {
	return (
		<div className="flex items-center gap-3 rounded-lg px-2 py-2.5 opacity-50">
			<HugeiconsIcon className="text-muted-foreground" icon={icon} size={18} />
			<span className="flex-1 text-sm font-medium">{label}</span>
			<SettingsRowSoon />
		</div>
	);
}
