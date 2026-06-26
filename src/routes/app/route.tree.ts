import { Route as homeRoute } from "./pages/Home/route";
import { appLayoutRoute } from "./route";

export const appTree = appLayoutRoute.addChildren([homeRoute]);
