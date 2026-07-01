import { Route as assetRoute } from "./pages/Asset/route";
import { Route as overviewRoute } from "./pages/Overview/route";
import { Route as receiveRoute } from "./pages/Receive/route";
import { homeLayoutRoute } from "./route";

export const homeTree = homeLayoutRoute.addChildren([overviewRoute, assetRoute, receiveRoute]);
