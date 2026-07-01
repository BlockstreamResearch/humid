import { type PropsWithChildren, useCallback, useMemo, useState } from "react";

import type { AccountGroupRecord } from "@/core/accounts/application/account-registry/model/account-group";
import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { RenameAccountInput } from "@/core/accounts/application/accounts-rpc/model/types";
import type { ChainId, ChainRecord } from "@/core/chains/application/ChainRecord";
import {
	LIQUID_MAINNET_CHAIN_ID,
	LIQUID_TESTNET_CHAIN_ID,
} from "@/core/chains/liquid/domain/LiquidChain";

import type { Portfolio } from "./hooks/usePortfolio";
import { HomeContext } from "./index";

// Interactive stub of the home context for Storybook/tests. Account and chain
// selection is local so stories stay interactive without a background; portfolio is
// the rich display scaffolding (there is no portfolio backend yet). Shape matches
// HomeContextValue.

const CHAINS: ChainRecord[] = [
	{ chainGroupId: "liquid", id: LIQUID_MAINNET_CHAIN_ID, name: "Liquid", settings: {} },
	{ chainGroupId: "liquid", id: LIQUID_TESTNET_CHAIN_ID, name: "Liquid Testnet", settings: {} },
];

const ACCOUNT_GROUPS: AccountGroupRecord[] = [
	{
		chainAccountIds: ["chain-account:stub-1"],
		createdAt: 0,
		id: "account-group:stub-1",
		kind: "multichain",
		name: "Account 1",
		updatedAt: 0,
		walletId: "wallet:stub",
	},
	{
		chainAccountIds: ["chain-account:stub-2"],
		createdAt: 0,
		id: "account-group:stub-2",
		kind: "multichain",
		name: "Account 2",
		updatedAt: 0,
		walletId: "wallet:stub",
	},
];

const PORTFOLIO: Portfolio = {
	activity: {
		lbtc: [
			{
				amount: "0.2413",
				counterparty: "lq1qq…5424",
				date: "Feb 2, 2023",
				direction: "received",
				fiat: "$502.15",
				id: "a1",
			},
			{
				amount: "0.0300",
				counterparty: "lq1qq…8b94",
				date: "Jan 11, 2023",
				direction: "sent",
				fiat: "$62.43",
				id: "a2",
			},
			{
				amount: "0.1000",
				counterparty: "lq1qq…5424",
				date: "Dec 28, 2022",
				direction: "received",
				fiat: "$208.10",
				id: "a3",
			},
		],
		usdt: [],
	},
	isLoading: false,
	native: { amount: "2.45000000", symbol: "L-BTC" },
	tokens: [
		{
			amount: "2.45000000",
			fiat: "$154,350.00",
			id: "lbtc",
			name: "Liquid Bitcoin",
			price: "$63,000.00",
			symbol: "L-BTC",
		},
		{
			amount: "422.10",
			fiat: "$422.10",
			id: "usdt",
			name: "Tether USD",
			price: "$1.00",
			symbol: "USDt",
		},
	],
	totalFiat: "$154,772.10",
};

function useMockHomeValue() {
	const [selectedChainId, setSelectedChainId] = useState<ChainId>(CHAINS[0].id);
	const [accountGroups, setAccountGroups] = useState<AccountGroupRecord[]>(ACCOUNT_GROUPS);
	const [selectedAccountGroupId, setSelectedAccountGroupId] = useState<AccountGroupId>(
		ACCOUNT_GROUPS[0].id,
	);

	const chain = CHAINS.find((candidate) => candidate.id === selectedChainId) ?? CHAINS[0];
	const accountGroup =
		accountGroups.find((candidate) => candidate.id === selectedAccountGroupId) ?? accountGroups[0];

	const selectChain = useCallback((id: ChainId) => {
		setSelectedChainId(id);
	}, []);

	const selectAccount = useCallback((id: AccountGroupId) => {
		setSelectedAccountGroupId(id);
	}, []);

	const renameAccount = useCallback((input: RenameAccountInput) => {
		setAccountGroups((groups) =>
			groups.map((group) =>
				group.id === input.accountGroupId ? { ...group, name: input.name } : group,
			),
		);
	}, []);

	return useMemo(
		() => ({
			accountGroup,
			accountGroups,
			renameAccount,
			selectAccount,
			chain,
			chains: CHAINS,
			selectChain,
			portfolio: PORTFOLIO,
		}),
		[accountGroup, accountGroups, chain, renameAccount, selectChain, selectAccount],
	);
}

/** Story/test provider: injects the interactive mock value into HomeContext. */
export function MockHomeProvider({ children }: PropsWithChildren) {
	const value = useMockHomeValue();

	return <HomeContext.Provider value={value}>{children}</HomeContext.Provider>;
}
