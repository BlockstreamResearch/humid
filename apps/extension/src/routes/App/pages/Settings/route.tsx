import { createRoute } from "@tanstack/react-router";

import { appLayoutRoute } from "../../route";

export const settingsLayoutRoute = createRoute({
	getParentRoute: () => appLayoutRoute,
	path: "settings",
});
