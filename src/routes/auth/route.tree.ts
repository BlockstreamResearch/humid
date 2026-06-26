import { Route as createRoute } from "./pages/Create/route";
import { Route as introRoute } from "./pages/Intro/route";
import { authIndexRoute, authLayoutRoute } from "./route";

export const authTree = authLayoutRoute.addChildren([authIndexRoute, introRoute, createRoute]);
