import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { connectedDappsLayoutRoute } from "../../route";

export const Route = createRoute({
	getParentRoute: () => connectedDappsLayoutRoute,
	path: "/",
	component: lazyRouteComponent(() => import("./index"), "ConnectedDappsListPage"),
});
