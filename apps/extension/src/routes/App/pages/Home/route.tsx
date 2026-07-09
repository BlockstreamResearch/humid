import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { appLayoutRoute } from "../../route";

// Pathless layout (id, no path): wraps Overview + Asset in the home context without
// adding a URL segment. Overview stays at /app; Asset at /app/asset/$assetId.
export const homeLayoutRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	id: "home",
	component: lazyRouteComponent(() => import("./index"), "HomeLayout"),
});
