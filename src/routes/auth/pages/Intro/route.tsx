import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { authLayoutRoute } from "../../route";

export const Route = createRoute({
	getParentRoute: () => authLayoutRoute,
	path: "intro",
	component: lazyRouteComponent(() => import("./index"), "AuthIntroPage"),
});
