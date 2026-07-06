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
		<div className="bg-background text-foreground relative isolate flex size-full min-h-0 flex-col overflow-hidden">
			<div className="absolute z-10 size-full min-h-0 overflow-hidden pb-15">{children}</div>
			<div className="absolute bottom-0 z-20 w-full">
				<AppFooter active={active} />
			</div>
		</div>
	);
}
