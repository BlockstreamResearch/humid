import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { connectedDappsLayoutRoute } from "../../route";

export const Route = createRoute({
	getParentRoute: () => connectedDappsLayoutRoute,
	path: "$dappKey",
	component: lazyRouteComponent(() => import("./index"), "ConnectedDappItemPage"),
});
