import { createWalletMethodRegistry } from "@/core/wallet-methods/createWalletMethodRegistry";

import type { LiquidIdentityBackend } from "./backends/LiquidIdentityBackend";
import type { LiquidWalletBackend } from "./backends/LiquidWalletBackend";
import type { LiquidRpcMethodContext, LiquidWalletRpcContext } from "./LiquidRpcContext";
import { liquidRpcMethods } from "./liquidRpcMethods";
import type { LiquidProcessCtDependencies } from "./methods/processConfidentialTransaction";

export type { LiquidWalletRpcContext };

export type CreateLiquidRpcRouterDependencies = {
	identityBackend: LiquidIdentityBackend;
	processCt: LiquidProcessCtDependencies;
	walletBackend: LiquidWalletBackend;
};

export type LiquidRpcRouter = ReturnType<typeof createLiquidRpcRouter>;

export function createLiquidRpcRouter({
	identityBackend,
	processCt,
	walletBackend,
}: CreateLiquidRpcRouterDependencies) {
	return createWalletMethodRegistry<LiquidWalletRpcContext, LiquidRpcMethodContext>(
		liquidRpcMethods(processCt),
		(context) => ({ ...context, identityBackend, walletBackend }),
	);
}
