import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { rootRoute } from "../__root";
import { requireUnlocked } from "../guards";

export const appLayoutRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/app",
	beforeLoad: requireUnlocked,
	component: lazyRouteComponent(() => import("./index"), "AppLayout"),
});
