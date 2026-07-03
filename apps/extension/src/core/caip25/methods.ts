/**
 * CAIP-25 / CAIP-27 injected (dapp-facing) method names exposed on `window.humid`.
 * These replace direct chain-method calls: a dapp authorizes via
 * `wallet_createSession` and then invokes chain methods through
 * `wallet_invokeMethod`, gated by the granted session scopes.
 */
export const caip25Rpc = {
	methods: {
		createSession: "wallet_createSession",
		getSession: "wallet_getSession",
		invokeMethod: "wallet_invokeMethod",
		revokeSession: "wallet_revokeSession",
	},
} as const;
