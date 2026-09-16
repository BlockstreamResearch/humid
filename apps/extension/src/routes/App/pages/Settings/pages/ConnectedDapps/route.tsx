import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { settingsLayoutRoute } from "../../route";

export const connectedDappsLayoutRoute = createRoute({
	getParentRoute: () => settingsLayoutRoute,
	path: "account/$accountGroupId/connected-dapps",
	component: lazyRouteComponent(() => import("./index"), "ConnectedDappsLayout"),
});
