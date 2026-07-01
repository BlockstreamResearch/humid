import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { chainsLayoutRoute } from "../../route";

export const Route = createRoute({
	getParentRoute: () => chainsLayoutRoute,
	path: "$chainId",
	component: lazyRouteComponent(() => import("./index"), "ChainItemPage"),
});
