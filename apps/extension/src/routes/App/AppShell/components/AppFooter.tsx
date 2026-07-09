import { Home01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/theme/utils.ts";

export type AppTab = "home" | "settings";

const TABS = [
	{ icon: Home01Icon, label: "Home", tab: "home", to: "/app" },
	{ icon: Settings01Icon, label: "Settings", tab: "settings", to: "/app/settings" },
] as const;

/** Shared bottom navigation. Presentational — the active tab is resolved by the shell. */
export function AppFooter({ active }: { active: AppTab }) {
	return (
		<nav className="border-border/60 flex h-15 border-t">
			{TABS.map(({ icon, label, tab, to }) => {
				const isActive = tab === active;

				return (
					<Link
						key={tab}
						to={to}
						aria-current={isActive ? "page" : undefined}
						className={cn(
							"flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
							isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
						)}
					>
						<HugeiconsIcon icon={icon} size={20} strokeWidth={isActive ? 2 : 1.6} />
						{label}
					</Link>
				);
			})}
		</nav>
	);
}
