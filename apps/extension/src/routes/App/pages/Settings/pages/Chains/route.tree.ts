import { Route as addRoute } from "./pages/Add/route";
import { Route as itemRoute } from "./pages/Item/route";
import { Route as listRoute } from "./pages/List/route";
import { chainsLayoutRoute } from "./route";

export const chainsTree = chainsLayoutRoute.addChildren([listRoute, addRoute, itemRoute]);
