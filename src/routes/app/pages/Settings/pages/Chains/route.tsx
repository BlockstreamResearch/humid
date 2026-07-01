import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { settingsLayoutRoute } from "../../route";

// Layout route for the Chains area under /app/settings/chains: hosts the chain
// list and the per-chain settings page. Each page owns its own header.
export const chainsLayoutRoute = createRoute({
	getParentRoute: () => settingsLayoutRoute,
	path: "chains",
	component: lazyRouteComponent(() => import("./index"), "ChainsLayout"),
});
