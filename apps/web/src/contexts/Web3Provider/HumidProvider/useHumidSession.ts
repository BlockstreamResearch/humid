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
	result: Caip25GetSessionResult | null;
	session: Caip25Scopes | null;
	policy: MethodPolicy;
	refresh: () => void;
};

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
