import {
	getSession,
	readMethodPolicy,
	type Caip25GetSessionResult,
	type Caip25Scopes,
	type CaipRpcProvider,
	type MethodPolicy,
} from "@humid/appkit-injected-adapter";
import { useQuery } from "@tanstack/react-query";

export const HUMID_SESSION_QUERY_KEY = ["humid", "session"] as const;

export type HumidSession = {
	/** Full `wallet_getSession` result, or null when there is no session (or no provider yet). */
	result: Caip25GetSessionResult | null;
	/** Authorized scopes keyed by CAIP-2 chain id. */
	session: Caip25Scopes | null;
	/** The wallet's silent-vs-prompt policy for the active chain. */
	policy: MethodPolicy;
	/** Re-read the session on demand (read-only — no wallet prompt). */
	refresh: () => void;
};

/**
 * Read the CAIP-25 session and fold in the active chain's method policy. Polled on an interval so the
 * connection / permission state stays live after a connect, disconnect, or revoke without a manual
 * refresh; `wallet_getSession` is a read-only call, so the poll never prompts.
 */
export function useHumidSession(provider: CaipRpcProvider | null, chainId: string): HumidSession {
	const query = useQuery({
		queryKey: HUMID_SESSION_QUERY_KEY,
		enabled: Boolean(provider),
		queryFn: async () => {
			if (!provider) return null;
			return getSession(provider);
		},
		refetchInterval: 4000,
		refetchIntervalInBackground: true,
		refetchOnWindowFocus: false,
		staleTime: 2000,
		initialData: null,
	});

	const result = query.data ?? null;
	const session = result?.sessionScopes ?? null;
	const policy = result ? readMethodPolicy(result, chainId) : {};

	return {
		result,
		session,
		policy,
		refresh: () => {
			void query.refetch();
		},
	};
}
