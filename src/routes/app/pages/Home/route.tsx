import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { appLayoutRoute } from "../../route";

export const Route = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: "/",
	component: lazyRouteComponent(() => import("./index"), "AppHomePage"),
});
