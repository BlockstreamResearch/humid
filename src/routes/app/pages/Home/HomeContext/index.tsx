import { createContext, type PropsWithChildren, useContext } from "react";

import type { AccountGroupRecord } from "@/core/accounts/application/account-registry/model/account-group";
import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { RenameAccountInput } from "@/core/accounts/application/accounts-rpc/model/types";
import type { ChainId, ChainRecord } from "@/core/chains/application/ChainRecord";
import { UiSpinner } from "@/ui/UiSpinner";

import { useChains } from "./hooks/useChains";
import { useHomeValue } from "./hooks/useHomeValue";
import { useSelectedAccount } from "./hooks/useSelectedAccount";

export type HomeContextValue = ReturnType<typeof useHomeValue>;

// Exported so Storybook/tests can inject a mock value (see ./mock).
export const HomeContext = createContext<HomeContextValue | null>(null);

/**
 * Provides the home area's main data. Resolves the account and chain axes from the
 * background and handles their load state here (loading / error), like the reference
 * `ProjectRouteProvider`, before the value is assembled.
 */
export function HomeProvider({ children }: PropsWithChildren) {
	const chains = useChains();
	const accounts = useSelectedAccount();

	if (chains.isLoading || accounts.isLoading) return <HomeLoading />;

	if (chains.isError || !chains.chain || accounts.isError || !accounts.accountGroup) {
		return <HomeError />;
	}

	return (
		<HomeDataProvider
			accountGroup={accounts.accountGroup}
			accountGroups={accounts.accountGroups}
			chain={chains.chain}
			chains={chains.chains}
			renameAccount={accounts.renameAccount}
			selectAccount={accounts.selectAccount}
			selectChain={chains.selectChain}
		>
			{children}
		</HomeDataProvider>
	);
}

function HomeDataProvider(
	props: PropsWithChildren<{
		accountGroup: AccountGroupRecord;
		accountGroups: AccountGroupRecord[];
		chain: ChainRecord;
		chains: ChainRecord[];
		renameAccount: (input: RenameAccountInput) => void;
		selectAccount: (accountGroupId: AccountGroupId) => void;
		selectChain: (chainId: ChainId) => void;
	}>,
) {
	const value = useHomeValue({
		accountGroup: props.accountGroup,
		accountGroups: props.accountGroups,
		chain: props.chain,
		chains: props.chains,
		renameAccount: props.renameAccount,
		selectAccount: props.selectAccount,
		selectChain: props.selectChain,
	});

	return <HomeContext.Provider value={value}>{props.children}</HomeContext.Provider>;
}

export function useHome() {
	const context = useContext(HomeContext);

	if (!context) {
		throw new Error("useHome must be used inside HomeProvider.");
	}

	return context;
}

function HomeLoading() {
	return (
		<div className="flex size-full items-center justify-center">
			<UiSpinner />
		</div>
	);
}

function HomeError() {
	return (
		<div className="text-muted-foreground flex size-full items-center justify-center px-6 text-center text-sm">
			Couldn&apos;t load your wallet. Reopen the extension and try again.
		</div>
	);
}
