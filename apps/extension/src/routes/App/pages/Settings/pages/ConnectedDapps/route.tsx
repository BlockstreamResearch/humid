import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { settingsLayoutRoute } from "../../route";

// Layout route for the Connected Dapps area under /app/settings/account/$accountGroupId/connected-dapps:
// hosts the per-account dapp list and the per-dapp permission page. Each page owns its own header.
export const connectedDappsLayoutRoute = createRoute({
	getParentRoute: () => settingsLayoutRoute,
	path: "account/$accountGroupId/connected-dapps",
	component: lazyRouteComponent(() => import("./index"), "ConnectedDappsLayout"),
});
