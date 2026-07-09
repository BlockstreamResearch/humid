import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { appLayoutRoute } from "../../route";

// Layout route for the Settings tab: hosts the settings pages under /app/settings.
// Each page owns its own header; this route only renders the active child.
export const settingsLayoutRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: "settings",
	component: lazyRouteComponent(() => import("./index"), "SettingsLayout"),
});
