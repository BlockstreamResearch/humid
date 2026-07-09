import { Outlet } from "@tanstack/react-router";

import UiPageBackgroundWrp from "@/ui/UiPageBackgroundWrp";

/** Settings area layout: renders the active settings page. Each page owns its header. */
export function SettingsLayout() {
	return (
		<UiPageBackgroundWrp>
			<Outlet />
		</UiPageBackgroundWrp>
	);
}
