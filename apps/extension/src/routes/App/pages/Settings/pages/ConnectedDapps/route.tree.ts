import { Route as itemRoute } from "./pages/Item/route";
import { Route as listRoute } from "./pages/List/route";
import { connectedDappsLayoutRoute } from "./route";

export const connectedDappsTree = connectedDappsLayoutRoute.addChildren([listRoute, itemRoute]);
