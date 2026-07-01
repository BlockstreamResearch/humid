import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppFooter } from "./components/AppFooter";

/**
 * App-area shell: the current tab page over a shared, pinned bottom navigation.
 * Each page owns its own header and scroll; the shell bounds the page region and
 * pins the footer beneath it. Fills the 375x600 popup via `size-full`.
 */
export function AppShell({ children }: { children: ReactNode }) {
	const { pathname } = useLocation();
	const active = pathname.startsWith("/app/settings") ? "settings" : "home";

	return (
		<div className="bg-background text-foreground flex size-full min-h-0 flex-col overflow-hidden">
			<div className="min-h-0 flex-1">{children}</div>
			<AppFooter active={active} />
		</div>
	);
}
