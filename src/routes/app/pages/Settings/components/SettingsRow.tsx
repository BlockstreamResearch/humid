import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps, ReactNode } from "react";

type Icon = ComponentProps<typeof HugeiconsIcon>["icon"];

/** Shared layout for a settings row; the caller wraps it in a button / Link / div. */
export const settingsRowClass =
	"flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors";

/** Row body: leading icon, label, and a trailing slot (defaults to a chevron). */
export function SettingsRowContent({
	icon,
	label,
	trailing,
}: {
	icon: Icon;
	label: string;
	trailing?: ReactNode;
}) {
	return (
		<>
			<HugeiconsIcon className="text-muted-foreground shrink-0" icon={icon} size={18} />
			<span className="flex-1 text-sm font-medium">{label}</span>
			{trailing ?? (
				<HugeiconsIcon
					className="text-muted-foreground/60 shrink-0"
					icon={ArrowRight01Icon}
					size={16}
				/>
			)}
		</>
	);
}

/** Trailing badge for a row whose action has no backend yet / is pending a decision. */
export function SettingsRowSoon() {
	return (
		<span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
			Soon
		</span>
	);
}
