import { AccountSwitcher } from "./components/AccountSwitcher";
import { ChainSelector } from "./components/ChainSelector";
import { ConnectedDappsMenu } from "./components/ConnectedDappsMenu";

/** Overview header: chain switcher (left); connected-dapps trigger + account switcher (right). */
export function HomeHeader() {
	return (
		<header className="border-border/60 flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5">
			<ChainSelector />
			<div className="flex items-center gap-1">
				<ConnectedDappsMenu />
				<AccountSwitcher />
			</div>
		</header>
	);
}
