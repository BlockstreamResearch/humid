import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { rootRoute } from "../__root";
import { requireLockedVault } from "../guards";

export const localAuthRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/local-auth",
	beforeLoad: requireLockedVault,
	component: lazyRouteComponent(() => import("./index"), "LocalAuthPage"),
});
