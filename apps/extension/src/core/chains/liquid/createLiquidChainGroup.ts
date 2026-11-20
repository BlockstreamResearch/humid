import { createLwkWalletBackend } from "./adapters/lwk/createLwkWalletBackend";
import { createLwkLiquidIdentityBackend } from "./adapters/lwk/identity/createLwkLiquidIdentityBackend";
import { getSyncWorkerClient } from "./adapters/lwk/sync-worker/createSyncWorkerClient";
import { processCtDependencies } from "./adapters/processCtDependencies";
import { createLiquidWalletConnectAdapter } from "./adapters/walletconnect/createLiquidWalletConnectAdapter";
import { createLiquidRpcRouter } from "./application/createLiquidRpcRouter";
import { quoteTransferSpeeds, readSpeedRates } from "./application/feeSpeeds";
import { createBuiltInLiquidChains } from "./chains/createBuiltInLiquidChains";
import { LIQUID_CHAIN_GROUP_ID } from "./chains/LiquidChainRecord";
import type { LiquidChainGroup } from "./contract";

const ACTIVITY_PAGE_SIZE = 25;

export function createLiquidChainGroup(): LiquidChainGroup {
	const identityBackend = createLwkLiquidIdentityBackend();
	const walletBackend = createLwkWalletBackend();
	const walletRpcDispatcher = createLiquidRpcRouter({
		identityBackend,
		processCt: processCtDependencies,
		walletBackend,
	});

	return {
		accountRuntime: {
			async estimateMaxSend(input, estimate) {
				const account = await walletBackend.resolveAccount(input);
				const rawAssetId = estimate.rawAssetId ?? account.rawPolicyAssetId;
				await walletBackend.syncAccount(account);

				return walletBackend.estimateMaxSend(account, estimate, rawAssetId);
			},
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
			async getReceiveAddress(input) {
				const account = await walletBackend.resolveAccount(input);

				return {
					...walletBackend.getReceiveAddress(account),
					explicit: walletBackend.getSigningAddress(account).explicit,
				};
			},
			async inspectTransfer(input, transfer) {
				const account = await walletBackend.resolveAccount(input);
				const rawAssetId = transfer.rawAssetId ?? account.rawPolicyAssetId;
				const review = await walletBackend.inspectTransfer(account, transfer, rawAssetId);
				await walletBackend.syncAccount(account);

				const quotes = await quoteTransferSpeeds(
					walletBackend,
					account,
					transfer,
					rawAssetId,
					await readSpeedRates(input.chain),
				);

				return { ...review, quotes };
			},
			async resolveAccountIdentifier(input) {
				const account = await walletBackend.resolveAccount(input);

				return account.accountIdentifier;
			},
			async resolveScanTarget(input) {
				const account = await walletBackend.resolveAccount(input);

				return { chain: input.chain, descriptor: account.descriptor };
			},
			async scanPortfolio(target) {
				const snapshot = await getSyncWorkerClient().scanAndRead({
					chain: target.chain,
					descriptor: target.descriptor,
				});

				return { assets: snapshot.assets, utxos: snapshot.utxos };
			},
			async sendTransfer(input, transfer) {
				const account = await walletBackend.resolveAccount(input);
				const rawAssetId = transfer.rawAssetId ?? account.rawPolicyAssetId;
				await walletBackend.syncAccount(account);

				return walletBackend.sendTransfer(account, transfer, rawAssetId, transfer.fee);
			},
		},
		chains: createBuiltInLiquidChains(),
		id: LIQUID_CHAIN_GROUP_ID,
		walletConnectAdapter: createLiquidWalletConnectAdapter({
			dispatcher: walletRpcDispatcher,
			walletBackend,
		}),
		walletRpcDispatcher,
	};
}
