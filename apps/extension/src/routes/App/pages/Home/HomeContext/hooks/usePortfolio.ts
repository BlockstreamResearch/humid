import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import type { PortfolioSnapshot } from "@/core/accounts/application/accounts-rpc/model/types";
import type { PortfolioViewAsset } from "@/core/chains/application/PortfolioView";
import { parseBaseUnits } from "@/helpers/formatters";

const PORTFOLIO_IDLE_POLL_MS = 20_000;

const PORTFOLIO_ACTIVE_SYNC_POLL_MS = 2_000;

export const portfolioQueryKey = (accountGroupId: string, chainId: string) =>
	["portfolio", accountGroupId, chainId] as const;

export type Portfolio = {
	error: string | null;
	isLoading: boolean;
	isSyncing: boolean;
	native: { amount: bigint; decimals: number; symbol: string } | null;
	syncedAt: number | null;
	tokens: PortfolioViewAsset[];
};

const EMPTY_PORTFOLIO: Portfolio = {
	error: null,
	isLoading: false,
	isSyncing: false,
	native: null,
	syncedAt: null,
	tokens: [],
};

export function usePortfolio(keys: { accountGroupId: string; chainId: string }): Portfolio {
	const query = useQuery({
		queryFn: () => accountsClient.getPortfolio(),
		queryKey: portfolioQueryKey(keys.accountGroupId, keys.chainId),
		refetchInterval: (portfolioQuery) =>
			portfolioQuery.state.data?.isSyncing ? PORTFOLIO_ACTIVE_SYNC_POLL_MS : PORTFOLIO_IDLE_POLL_MS,
	});

	return useMemo(() => toPortfolio(query.data, query.isPending), [query.data, query.isPending]);
}

function toPortfolio(snapshot: PortfolioSnapshot | undefined, isPending: boolean): Portfolio {
	if (!snapshot) return { ...EMPTY_PORTFOLIO, isLoading: isPending, isSyncing: isPending };

	const { data, error, isSyncing, syncedAt } = snapshot;

	if (!data) return { ...EMPTY_PORTFOLIO, error, isSyncing, syncedAt };

	const nativeAsset = data.assets.find((asset) => asset.isNative) ?? null;

	return {
		error,
		isLoading: false,
		isSyncing,
		syncedAt,
		native: nativeAsset
			? {
					amount: parseBaseUnits(nativeAsset.amountSats),
					decimals: nativeAsset.decimals,
					symbol: nativeAsset.symbol,
				}
			: null,
		tokens: data.assets.map((asset) => ({
			amount: parseBaseUnits(asset.amountSats),
			decimals: asset.decimals,
			id: asset.rawAssetId,
			metadata: asset.metadata,
			name: asset.name,
			symbol: asset.symbol,
		})),
	};
}
