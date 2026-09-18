import type { Caip25Scopes } from "@humid/appkit-injected-adapter";

import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

export type MethodState = "silent" | "needs-approval" | "unsupported";

export function methodState(
	method: string,
	session: Caip25Scopes | null,
	chainId: string,
	isSilent: (method: string) => boolean,
): MethodState {
	const surface = session?.[chainId]?.methods ?? [];
	if (!surface.includes(method)) return "unsupported";
	return isSilent(method) ? "silent" : "needs-approval";
}

export function useMethodState(method: string): MethodState {
	const { session, chainId, isSilent } = useHumidContext();
	return methodState(method, session, chainId, isSilent);
}
