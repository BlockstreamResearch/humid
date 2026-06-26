import { Route as passwordRoute } from "./pages/Password/route";
import { Route as secretRoute } from "./pages/Secret/route";
import { Route as createLayoutRoute } from "./route";

export const createTree = createLayoutRoute.addChildren([secretRoute, passwordRoute]);
