import { Outlet } from "@tanstack/react-router";

/** Settings area layout: renders the active settings page. Each page owns its header. */
export function SettingsLayout() {
	return <Outlet />;
}
