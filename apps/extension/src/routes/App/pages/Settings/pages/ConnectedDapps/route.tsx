import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { settingsLayoutRoute } from "../../route";

export const Route = createRoute({
	getParentRoute: () => settingsLayoutRoute,
	path: "account/$accountGroupId/connected-dapps",
	component: lazyRouteComponent(() => import("./index"), "SettingsConnectedDappsPage"),
});
