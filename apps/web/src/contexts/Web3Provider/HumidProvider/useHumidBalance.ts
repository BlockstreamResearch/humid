import type { WalletClient } from "@humid/appkit-injected-adapter";
import { useQuery } from "@tanstack/react-query";

import { deriveDataStatus, type DataStatus } from "./status";

export const HUMID_BALANCE_QUERY_KEY = ["humid", "balance"] as const;

export type HumidBalance = {
	balance: bigint;
	status: DataStatus;
	refresh: () => void;
};

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
