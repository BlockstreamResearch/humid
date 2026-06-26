import { createTree } from "./pages/Create/route.tree";
import { Route as introRoute } from "./pages/Intro/route";
import { authIndexRoute, authLayoutRoute } from "./route";

export const authTree = authLayoutRoute.addChildren([authIndexRoute, introRoute, createTree]);
