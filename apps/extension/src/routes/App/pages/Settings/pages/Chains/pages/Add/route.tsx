import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { chainsLayoutRoute } from "../../route";

type ChainAddSearch = {
	group?: string;
};

export const Route = createRoute({
	getParentRoute: () => chainsLayoutRoute,
	path: "add",
	validateSearch: (search: Record<string, unknown>): ChainAddSearch => ({
		group: typeof search.group === "string" ? search.group : undefined,
	}),
	component: lazyRouteComponent(() => import("./index"), "ChainAddPage"),
});
