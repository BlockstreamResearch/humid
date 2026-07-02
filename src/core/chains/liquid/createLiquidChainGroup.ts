import { createLwkWalletBackend } from "./adapters/lwk/createLwkWalletBackend";
import { createLwkLiquidIdentityBackend } from "./adapters/lwk/identity/createLwkLiquidIdentityBackend";
import { getSyncWorkerClient } from "./adapters/lwk/sync-worker/createSyncWorkerClient";
import { createLiquidWalletConnectAdapter } from "./adapters/walletconnect/createLiquidWalletConnectAdapter";
import { createLiquidRpcRouter } from "./application/createLiquidRpcRouter";
import { createBuiltInLiquidChains } from "./chains/createBuiltInLiquidChains";
import { LIQUID_CHAIN_GROUP_ID } from "./chains/LiquidChainRecord";
import type { LiquidChainGroup } from "./contract";

/** How many activity entries one on-demand `getActivity` page returns. */
const ACTIVITY_PAGE_SIZE = 25;

export function createLiquidChainGroup(): LiquidChainGroup {
	const identityBackend = createLwkLiquidIdentityBackend();
	const walletBackend = createLwkWalletBackend();
	const walletRpcDispatcher = createLiquidRpcRouter({
		identityBackend,
		walletBackend,
	});

	return {
		accountRuntime: {
			async getActivity(input, rawAssetId, cursor) {
				const account = await walletBackend.resolveAccount(input);

				return getSyncWorkerClient().readActivity({
					chain: input.chain,
					cursor,
					descriptor: account.descriptor,
					limit: ACTIVITY_PAGE_SIZE,
					rawAssetId,
				});
			},
			async getPortfolio(input) {
				const account = await walletBackend.resolveAccount(input);
				const snapshot = await getSyncWorkerClient().scanAndRead({
					chain: input.chain,
					descriptor: account.descriptor,
				});

				return { assets: snapshot.assets };
			},
			async getReceiveAddress(input) {
				const account = await walletBackend.resolveAccount(input);

				return walletBackend.getReceiveAddress(account);
			},
		},
		chains: createBuiltInLiquidChains(),
		id: LIQUID_CHAIN_GROUP_ID,
		walletConnectAdapter: createLiquidWalletConnectAdapter({
			identityBackend,
			walletBackend,
		}),
		walletRpcDispatcher,
	};
}
