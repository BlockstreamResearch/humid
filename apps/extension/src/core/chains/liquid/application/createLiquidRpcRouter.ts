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

export function createLiquidRpcRouter({
	identityBackend,
	walletBackend,
}: CreateLiquidRpcRouterDependencies) {
	return createWalletMethodRegistry<LiquidWalletRpcContext, LiquidRpcMethodContext>(
		LIQUID_RPC_METHODS,
		(context) => ({ ...context, identityBackend, walletBackend }),
	);
}
