import { createWalletMethodRegistry } from "@/core/wallet-methods/createWalletMethodRegistry";

import type { LiquidIdentityBackend } from "./backends/LiquidIdentityBackend";
import type { LiquidWalletBackend } from "./backends/LiquidWalletBackend";
import type { LiquidRpcMethodContext, LiquidWalletRpcContext } from "./LiquidRpcContext";
import { LIQUID_RPC_METHODS } from "./liquidRpcMethods";

export type { LiquidWalletRpcContext };

export type CreateLiquidRpcRouterDependencies = {
	identityBackend: LiquidIdentityBackend;
	walletBackend: LiquidWalletBackend;
};

/**
 * Builds the Liquid dapp RPC registry from {@link LIQUID_RPC_METHODS}: the JSON-RPC
 * dispatcher plus the advertised method names, both derived from that one list.
 * The wallet and identity backends are injected into each method's context here, so
 * dispatch callers only supply the chain and key-manager state
 * ({@link LiquidWalletRpcContext}).
 */
export function createLiquidRpcRouter({
	identityBackend,
	walletBackend,
}: CreateLiquidRpcRouterDependencies) {
	return createWalletMethodRegistry<LiquidWalletRpcContext, LiquidRpcMethodContext>(
		LIQUID_RPC_METHODS,
		(context) => ({ ...context, identityBackend, walletBackend }),
	);
}
