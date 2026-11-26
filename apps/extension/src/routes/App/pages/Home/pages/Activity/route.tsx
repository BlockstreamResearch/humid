import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { homeLayoutRoute } from "../../route";

export const Route = createRoute({
	getParentRoute: () => homeLayoutRoute,
	path: "activity",
	component: lazyRouteComponent(() => import("./index"), "ActivityPage"),
});
