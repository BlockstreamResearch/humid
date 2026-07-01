import { Outlet } from "@tanstack/react-router";

import { HomeProvider } from "./HomeContext";

/**
 * Home area layout: provides the account / network context (a scope Settings and
 * other app tabs do not share) to its tabs — Overview and Asset — and renders the
 * active one. Each tab owns its own header and scroll.
 */
export function HomeLayout() {
	return (
		<HomeProvider>
			<Outlet />
		</HomeProvider>
	);
}
