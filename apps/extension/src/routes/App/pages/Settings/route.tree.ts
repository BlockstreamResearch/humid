import { Route as accountRoute } from "./pages/Account/route";
import { Route as addAccountRoute } from "./pages/AddAccount/route";
import { chainsTree } from "./pages/Chains/route.tree";
import { connectedDappsTree } from "./pages/ConnectedDapps/route.tree";
import { Route as recoveryPhraseRoute } from "./pages/RecoveryPhrase/route";
import { Route as rootRoute } from "./pages/Root/route";
import { Route as themeRoute } from "./pages/Theme/route";
import { settingsLayoutRoute } from "./route";

export const settingsTree = settingsLayoutRoute.addChildren([
	rootRoute,
	accountRoute,
	addAccountRoute,
	chainsTree,
	themeRoute,
	connectedDappsTree,
	recoveryPhraseRoute,
]);
