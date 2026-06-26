import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { Route as createLayoutRoute } from "../../route";

export const Route = createRoute({
	getParentRoute: () => createLayoutRoute,
	path: "/",
	component: lazyRouteComponent(() => import("./index"), "AuthCreateSecretPage"),
});
