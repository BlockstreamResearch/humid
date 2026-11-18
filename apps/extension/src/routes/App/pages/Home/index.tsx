import { Outlet } from "@tanstack/react-router";

import { HomeProvider } from "./HomeContext";

export function HomeLayout() {
	return (
		<HomeProvider>
			<Outlet />
		</HomeProvider>
	);
}
