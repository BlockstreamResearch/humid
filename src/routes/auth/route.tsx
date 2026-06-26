import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { rootRoute } from "../__root";
import { requireNoVault } from "../guards";

export const authLayoutRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/auth",
	beforeLoad: requireNoVault,
	component: lazyRouteComponent(() => import("./index"), "AuthLayout"),
});

export const authIndexRoute = createRoute({
	getParentRoute: () => authLayoutRoute,
	path: "/",
	component: lazyRouteComponent(() => import("./index"), "AuthIndexForwarder"),
});
