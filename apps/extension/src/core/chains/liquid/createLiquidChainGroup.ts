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
			async getReceiveAddress(input) {
				const account = await walletBackend.resolveAccount(input);

				return walletBackend.getReceiveAddress(account);
			},
			async inspectTransfer(input, transfer) {
				const account = await walletBackend.resolveAccount(input);
				// No `assetId` means the native policy asset (L-BTC). Preview only — no sync needed, since
				// `inspectTransfer` just validates the recipient and resolves the asset (no UTXO selection).
				const rawAssetId = transfer.rawAssetId ?? account.rawPolicyAssetId;

				return walletBackend.inspectTransfer(account, transfer, rawAssetId);
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
				// Each resolve derives a fresh (unsynced) wallet, so sync it before building — the same
				// order the dapp path uses (review syncs, then execute builds/signs/broadcasts). The
				// signing + offscreen broadcast inside `sendTransfer` are unchanged.
				await walletBackend.syncAccount(account);

				return walletBackend.sendTransfer(account, transfer, rawAssetId);
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
