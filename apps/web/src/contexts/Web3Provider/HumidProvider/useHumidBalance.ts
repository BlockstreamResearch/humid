import type { WalletClient } from "@humid/appkit-injected-adapter";
import { useQuery } from "@tanstack/react-query";

import { deriveDataStatus, type DataStatus } from "./status";

export const HUMID_BALANCE_QUERY_KEY = ["humid", "balance"] as const;

export type HumidBalance = {
	/** Native L-BTC (policy asset) balance in base units. */
	balance: bigint;
	status: DataStatus;
	/** Fetch now regardless of policy (prompts when the method is not silent). */
	refresh: () => void;
};

/**
 * Native L-BTC balance for the active chain. `getBalance()` with no asset id resolves the policy
 * asset, so `result.balance` is the L-BTC base-unit amount. Policy-aware: the query auto-runs only
 * when connected and the wallet marks `getBalance` silent — otherwise the status is `needs-approval`
 * and the value loads only when `refresh` is called explicitly.
 */
export function useHumidBalance(args: {
	wallet: WalletClient;
	chainId: string;
	isConnected: boolean;
	silent: boolean;
}): HumidBalance {
	const { wallet, chainId, isConnected, silent } = args;

	const query = useQuery({
		queryKey: [...HUMID_BALANCE_QUERY_KEY, chainId],
		enabled: isConnected && silent,
		queryFn: async () => {
			const result = await wallet.getBalance();
			return BigInt(result.balance);
		},
		refetchInterval: 30_000,
		refetchIntervalInBackground: true,
		staleTime: 15_000,
	});

	return {
		balance: query.data ?? 0n,
		status: deriveDataStatus(query, { connected: isConnected, silent }),
		refresh: () => {
			void query.refetch();
		},
	};
}
