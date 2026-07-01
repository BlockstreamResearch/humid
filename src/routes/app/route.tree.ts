import { homeTree } from "./pages/Home/route.tree";
import { Route as settingsRoute } from "./pages/Settings/route";
import { appLayoutRoute } from "./route";

export const appTree = appLayoutRoute.addChildren([homeTree, settingsRoute]);
