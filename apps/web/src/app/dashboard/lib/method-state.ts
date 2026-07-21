import type { Caip25Scopes } from "@humid/appkit-injected-adapter";

import { useHumidContext } from "@/contexts/Web3Provider/HumidProvider";

/**
 * The three states a method card renders. A method is `unsupported` when absent from the session's
 * surface; otherwise `silent` (runs without a prompt) or `needs-approval` (the wallet confirms it on
 * every call, and declining yields a JSON-RPC 4001).
 */
export type MethodState = "silent" | "needs-approval" | "unsupported";

/** Fold the session surface and the wallet's silent-vs-prompt policy into one of the three states. */
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

/** Resolve a method's three-state badge from the live context (session + policy for the active chain). */
export function useMethodState(method: string): MethodState {
	const { session, chainId, isSilent } = useHumidContext();
	return methodState(method, session, chainId, isSilent);
}
