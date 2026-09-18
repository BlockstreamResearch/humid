import { Outlet } from "@tanstack/react-router";

import UiPageBackgroundWrp from "@/ui/UiPageBackgroundWrp";

export function SettingsLayout() {
	return (
		<UiPageBackgroundWrp>
			<Outlet />
		</UiPageBackgroundWrp>
	);
}
