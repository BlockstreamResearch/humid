import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { accountsClient } from "@/core/accounts/application/accounts-rpc/client";
import type { PortfolioSnapshot } from "@/core/accounts/application/accounts-rpc/model/types";
import { formatUnits, handleTimestamp, truncateMiddle } from "@/helpers/formatters";

/** One asset row (native or issued) for the balance headline and token list. */
export type PortfolioToken = {
	amount: string;
	fiat: string;
	id: string;
	name: string;
	price: string;
	symbol: string;
};

/** One transaction in an asset's history. */
export type PortfolioActivity = {
	amount: string;
	counterparty: string;
	date: string;
	direction: string;
	fiat: string;
	id: string;
};

/** The portfolio axis: balance headline, token list, and per-asset activity (by id). */
export type Portfolio = {
	activity: Record<string, PortfolioActivity[]>;
	isLoading: boolean;
	native: { amount: string; symbol: string } | null;
	tokens: PortfolioToken[];
	totalFiat: string | null;
};

const EMPTY_PORTFOLIO: Portfolio = {
	activity: {},
	isLoading: false,
	native: null,
	tokens: [],
	totalFiat: null,
};

/**
 * The portfolio axis for the selected account on the selected chain. Reads the native
 * balance and activity from the background (which syncs the wallet first). Fiat prices
 * and issued-asset metadata have no source yet, so fiat fields stay empty and the token
 * list is native-only. Keyed by account + chain so it re-reads when either changes.
 */
export function usePortfolio(keys: { accountGroupId: string; chainId: string }): Portfolio {
	const query = useQuery({
		queryFn: () => accountsClient.getPortfolio(),
		queryKey: ["portfolio", keys.accountGroupId, keys.chainId],
	});

	return useMemo(() => toPortfolio(query.data, query.isPending), [query.data, query.isPending]);
}

/** Maps the backend snapshot to the display portfolio; fiat is unavailable (no feed). */
function toPortfolio(snapshot: PortfolioSnapshot | undefined, isLoading: boolean): Portfolio {
	if (!snapshot) return { ...EMPTY_PORTFOLIO, isLoading };

	const { native } = snapshot;
	const amount = formatUnits(native.amountSats, native.decimals);

	return {
		activity: {
			[native.rawAssetId]: snapshot.activity.map((entry) => ({
				amount: formatUnits(entry.amountSats, native.decimals),
				counterparty: truncateMiddle(entry.txid),
				date: entry.timestamp ? handleTimestamp(entry.timestamp).format("MMM D, YYYY") : "Pending",
				direction: entry.direction,
				fiat: "",
				id: entry.txid,
			})),
		},
		isLoading,
		native: { amount, symbol: native.symbol },
		tokens: [
			{
				amount,
				fiat: "",
				id: native.rawAssetId,
				name: native.name,
				price: "",
				symbol: native.symbol,
			},
		],
		totalFiat: null,
	};
}
