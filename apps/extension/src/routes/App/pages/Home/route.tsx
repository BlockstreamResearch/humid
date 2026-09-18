import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { appLayoutRoute } from "../../route";

export const homeLayoutRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: "home",
	component: lazyRouteComponent(() => import("./index"), "HomeLayout"),
});
