import { createHashHistory, createRoute, createRouter, Navigate } from "@tanstack/react-router";

import { rootRoute } from "./__root";
import { appTree } from "./App/route.tree";
import { authTree } from "./Auth/route.tree";
import { getDefaultRoute } from "./guards";
import { localAuthRoute } from "./LocalAuth/route";

const rootIndexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: () => <Navigate replace to={getDefaultRoute()} />,
});

const catchAllRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "$",
	component: () => <Navigate replace to={getDefaultRoute()} />,
});

const routeTree = rootRoute.addChildren([
	rootIndexRoute,
	appTree,
	authTree,
	localAuthRoute,
	catchAllRoute,
]);

export const router = createRouter({
	routeTree,
	history: createHashHistory(),
	defaultPreload: "intent",
	defaultPreloadStaleTime: 0,
	defaultStructuralSharing: true,
	trailingSlash: "never",
	scrollRestoration: true,
	defaultNotFoundComponent: () => <Navigate replace to={getDefaultRoute()} />,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
