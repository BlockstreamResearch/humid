import { Outlet } from "@tanstack/react-router";

import { AppShell } from "./AppShell";

export function AppLayout() {
	return (
		<AppShell>
			<Outlet />
		</AppShell>
	);
}
