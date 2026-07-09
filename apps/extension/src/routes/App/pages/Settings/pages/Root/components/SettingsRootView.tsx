import {
	Add01Icon,
	ArrowRight01Icon,
	GlobalIcon,
	PaintBoardIcon,
	ShieldKeyIcon,
	SquareLock01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import type { AccountGroupRecord } from "@/core/accounts/application/account-registry/model/account-group";
import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import { AccountAvatar } from "@/routes/App/components/AccountAvatar";
import { UiBadge } from "@/ui/UiBadge";
import { UiButton } from "@/ui/UiButton/base";
import { UiScrollArea } from "@/ui/UiScrollArea";

// Idle auto-lock choices shown in Settings (must mirror AUTO_LOCK_MINUTES_OPTIONS on the backend).
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

/** Settings landing: general vault actions + the account list (switch / drill in). */
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
		<div className="flex size-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 items-center border-b px-4 py-3">
				<h1 className="text-base font-semibold">Settings</h1>
			</header>
			<UiScrollArea className="min-h-0 flex-1">
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
						<div className="flex items-center gap-3 rounded-lg px-2 py-2.5">
							<HugeiconsIcon className="text-muted-foreground" icon={SquareLock01Icon} size={18} />
							<label className="flex-1 text-sm font-medium" htmlFor="settings-auto-lock">
								Auto-lock when idle
							</label>
							<select
								id="settings-auto-lock"
								className="border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm"
								value={String(autoLockMinutes)}
								onChange={(event) => onAutoLockChange(Number(event.target.value))}
							>
								{AUTO_LOCK_OPTIONS.map((option) => (
									<option key={option.minutes} value={option.minutes}>
										{option.label}
									</option>
								))}
							</select>
						</div>
						<Link
							className="hover:bg-accent flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors"
							to="/app/settings/chains"
						>
							<HugeiconsIcon className="text-muted-foreground" icon={GlobalIcon} size={18} />
							<span className="flex-1 text-sm font-medium">Chains</span>
							<HugeiconsIcon
								className="text-muted-foreground/60"
								icon={ArrowRight01Icon}
								size={16}
							/>
						</Link>
						<Link
							className="hover:bg-accent flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors"
							to="/app/settings/theme"
						>
							<HugeiconsIcon className="text-muted-foreground" icon={PaintBoardIcon} size={18} />
							<span className="flex-1 text-sm font-medium">Theme</span>
							<HugeiconsIcon
								className="text-muted-foreground/60"
								icon={ArrowRight01Icon}
								size={16}
							/>
						</Link>
						<DisabledRow icon={ShieldKeyIcon} label="Change password" />
					</section>

					<section className="flex flex-col gap-1">
						<div className="flex items-center justify-between px-2">
							<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
								Your accounts
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
			</UiScrollArea>
		</div>
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
	// Only wallets added via the Import flow carry `imported`; the onboarding wallet is
	// always "generated", so the primary account is never badged as imported.
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

/** A settings row for a not-yet-available action (no backend / pending a decision). */
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
			<span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
				Soon
			</span>
		</div>
	);
}
