import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { authLayoutRoute } from "../../route";

export const Route = createRoute({
	getParentRoute: () => authLayoutRoute,
	path: "create",
	component: lazyRouteComponent(() => import("./index"), "AuthCreatePage"),
});
