import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { settingsLayoutRoute } from "../../route";

export const Route = createRoute({
	getParentRoute: () => settingsLayoutRoute,
	path: "account/$accountGroupId",
	component: lazyRouteComponent(() => import("./index"), "SettingsAccountPage"),
});
