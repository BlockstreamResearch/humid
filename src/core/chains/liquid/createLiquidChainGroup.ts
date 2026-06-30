import { createLwkWalletBackend } from "./adapters/lwk/createLwkWalletBackend";
import { createLwkLiquidIdentityBackend } from "./adapters/lwk/identity/createLwkLiquidIdentityBackend";
import { createLiquidWalletConnectAdapter } from "./adapters/walletconnect/createLiquidWalletConnectAdapter";
import { createLiquidRpcRouter } from "./application/createLiquidRpcRouter";
import { createBuiltInLiquidChains } from "./chains/createBuiltInLiquidChains";
import { LIQUID_CHAIN_GROUP_ID } from "./chains/LiquidChainRecord";
import type { LiquidChainGroup } from "./contract";

export function createLiquidChainGroup(): LiquidChainGroup {
	const identityBackend = createLwkLiquidIdentityBackend();
	const walletBackend = createLwkWalletBackend();
	const walletRpcDispatcher = createLiquidRpcRouter({
		identityBackend,
		walletBackend,
	});

	return {
		chains: createBuiltInLiquidChains(),
		id: LIQUID_CHAIN_GROUP_ID,
		walletConnectAdapter: createLiquidWalletConnectAdapter({
			identityBackend,
			walletBackend,
		}),
		walletRpcDispatcher,
	};
}
