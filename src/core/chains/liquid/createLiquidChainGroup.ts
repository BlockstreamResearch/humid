import { createLwkWalletBackend } from "./adapters/lwk/createLwkWalletBackend";
import { createLwkLiquidIdentityBackend } from "./adapters/lwk/identity/createLwkLiquidIdentityBackend";
import { createLiquidWalletConnectAdapter } from "./adapters/walletconnect/createLiquidWalletConnectAdapter";
import { createLiquidRpcRouter } from "./application/createLiquidRpcRouter";
import { createBuiltInLiquidChains } from "./chains/createBuiltInLiquidChains";
import { LIQUID_CHAIN_GROUP_ID } from "./chains/LiquidChainRecord";
import type { LiquidChainGroup } from "./contract";
import { LIQUID_NATIVE_ASSET } from "./domain/LiquidAsset";

export function createLiquidChainGroup(): LiquidChainGroup {
	const identityBackend = createLwkLiquidIdentityBackend();
	const walletBackend = createLwkWalletBackend();
	const walletRpcDispatcher = createLiquidRpcRouter({
		identityBackend,
		walletBackend,
	});

	return {
		accountRuntime: {
			async getPortfolio(input) {
				const account = await walletBackend.resolveAccount(input);

				await walletBackend.syncAccount(account);

				return {
					activity: walletBackend.getActivity(account, account.rawPolicyAssetId),
					native: {
						amountSats: walletBackend.getBalance(account, account.rawPolicyAssetId),
						decimals: LIQUID_NATIVE_ASSET.decimals,
						name: LIQUID_NATIVE_ASSET.name,
						rawAssetId: account.rawPolicyAssetId,
						symbol: LIQUID_NATIVE_ASSET.symbol,
					},
				};
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
