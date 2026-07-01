import { Route as accountRoute } from "./pages/Account/route";
import { Route as addAccountRoute } from "./pages/AddAccount/route";
import { Route as recoveryPhraseRoute } from "./pages/RecoveryPhrase/route";
import { Route as rootRoute } from "./pages/Root/route";
import { settingsLayoutRoute } from "./route";

export const settingsTree = settingsLayoutRoute.addChildren([
	rootRoute,
	accountRoute,
	addAccountRoute,
	recoveryPhraseRoute,
]);
