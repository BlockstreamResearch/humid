import { createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { homeLayoutRoute } from "../../route";

type SendSearch = {
	asset?: string;
};

export const Route = createRoute({
	getParentRoute: () => homeLayoutRoute,
	path: "send",
	validateSearch: (search: Record<string, unknown>): SendSearch => ({
		asset: typeof search.asset === "string" ? search.asset : undefined,
	}),
	component: lazyRouteComponent(() => import("./index"), "SendPage"),
});
