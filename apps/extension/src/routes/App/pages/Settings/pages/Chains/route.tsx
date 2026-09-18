import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { settingsLayoutRoute } from "../../route";

export const chainsLayoutRoute = createRoute({
	getParentRoute: () => settingsLayoutRoute,
	path: "chains",
	component: lazyRouteComponent(() => import("./index"), "ChainsLayout"),
});
