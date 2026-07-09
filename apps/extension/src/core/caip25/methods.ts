/**
 * CAIP-25 / CAIP-27 injected (dapp-facing) method names exposed on `window.humid`.
 * These replace direct chain-method calls: a dapp authorizes via
 * `wallet_createSession` and then invokes chain methods through
 * `wallet_invokeMethod`, gated by the granted session scopes.
 *
 * `addChain` / `switchChain` are chain-management methods layered on top: a dapp may propose a new
 * chain (gated behind a mandatory approval; the wallet mints its own id) and widen THIS connection's
 * granted chain scope to a chain the wallet already knows (also gated). Both are top-level injected
 * methods — NOT chain RPC methods reached through `wallet_invokeMethod`.
 */
export const caip25Rpc = {
	methods: {
		addChain: "wallet_addChain",
		createSession: "wallet_createSession",
		getSession: "wallet_getSession",
		invokeMethod: "wallet_invokeMethod",
		revokeSession: "wallet_revokeSession",
		switchChain: "wallet_switchChain",
	},
} as const;
