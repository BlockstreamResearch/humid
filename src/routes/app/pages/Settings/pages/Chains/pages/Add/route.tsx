import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { chainsLayoutRoute } from "../../route";

export const Route = createRoute({
	getParentRoute: () => chainsLayoutRoute,
	path: "add",
	component: lazyRouteComponent(() => import("./index"), "ChainAddPage"),
});
