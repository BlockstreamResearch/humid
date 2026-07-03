import { homeTree } from "./pages/Home/route.tree";
import { settingsTree } from "./pages/Settings/route.tree";
import { appLayoutRoute } from "./route";

export const appTree = appLayoutRoute.addChildren([homeTree, settingsTree]);
