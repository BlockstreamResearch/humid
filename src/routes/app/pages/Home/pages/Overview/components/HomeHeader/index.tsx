import { AccountSwitcher } from "./components/AccountSwitcher";
import { ChainSelector } from "./components/ChainSelector";

/** Overview header: chain switcher (left), account switcher (right). */
export function HomeHeader() {
	return (
		<header className="border-border/60 flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5">
			<ChainSelector />
			<AccountSwitcher />
		</header>
	);
}
