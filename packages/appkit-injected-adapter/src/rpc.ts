import type { Caip25CreateSessionResult, Caip25Scopes, CaipRpcProvider } from "./types";

/**
 * CAIP-25 (session authorization) + CAIP-27 (method invocation) envelope an injected wallet expects.
 * The wallet does NOT expose raw chain RPC methods directly: a dapp authorizes with
 * `wallet_createSession`, then invokes every method through `wallet_invokeMethod`, scoped to a chain.
 * These helpers are the one place that wraps raw calls into that envelope.
 */
export const CAIP25_METHODS = {
	createSession: "wallet_createSession",
	getSession: "wallet_getSession",
	invokeMethod: "wallet_invokeMethod",
	revokeSession: "wallet_revokeSession",
} as const;

/** Authorize a CAIP-25 session; typically opens the wallet's connect approval modal. */
export function createSession(
	provider: CaipRpcProvider,
	optionalScopes: Caip25Scopes,
): Promise<Caip25CreateSessionResult> {
	return provider.request<Caip25CreateSessionResult>({
		method: CAIP25_METHODS.createSession,
		params: { optionalScopes },
	});
}

/** Read the current session's granted scopes (empty when there is none). */
export function getSession(provider: CaipRpcProvider): Promise<{ sessionScopes: Caip25Scopes }> {
	return provider.request<{ sessionScopes: Caip25Scopes }>({
		method: CAIP25_METHODS.getSession,
	});
}

/** Revoke the current session for this origin. */
export function revokeSession(provider: CaipRpcProvider): Promise<{ revoked: boolean }> {
	return provider.request<{ revoked: boolean }>({
		method: CAIP25_METHODS.revokeSession,
	});
}

/** Invoke one method (CAIP-27) within a chain scope of the authorized session. */
export function invokeMethod<T>(
	provider: CaipRpcProvider,
	scope: string,
	method: string,
	params?: unknown,
): Promise<T> {
	return provider.request<T>({
		method: CAIP25_METHODS.invokeMethod,
		params: { scope, request: { method, params } },
	});
}
