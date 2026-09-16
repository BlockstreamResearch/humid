import { Outlet } from "@tanstack/react-router";

import UiPageBackgroundWrp from "@/ui/UiPageBackgroundWrp";

import { HomeProvider } from "./HomeContext";

export function HomeLayout() {
	return (
		<HomeProvider>
			<UiPageBackgroundWrp>
				<Outlet />
			</UiPageBackgroundWrp>
		</HomeProvider>
	);
}
