import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../chains/LiquidChainRecord";
import type { ParsedLiquidAssetId } from "../../domain/LiquidAsset";
import {
	LIQUID_WALLET_RPC_METHODS,
	type LiquidGetBalanceParams,
	type LiquidGetBalanceResult,
} from "../../domain/LiquidRpc";
import { parseLiquidAssetId, parseLiquidGetBalanceParams } from "../../domain/validation";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../backends/LiquidWalletBackend";
import { resolveDappAccount } from "../dappAccountScope";
import type { ReadPortfolioSnapshot } from "../LiquidRpcContext";

export type LiquidGetBalanceContext = WalletRpcBaseContext & {
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	readPortfolioSnapshot?: ReadPortfolioSnapshot;
	updateKeyManagerState?: UpdateKeyManagerState;
	walletBackend: LiquidWalletBackend;
};

type LiquidGetBalanceReview = {
	account: LiquidWalletAccount;
	requestedAsset: ParsedLiquidAssetId;
};

export const getLiquidBalance = createWalletMethod<
	LiquidGetBalanceParams,
	LiquidGetBalanceContext,
	LiquidGetBalanceReview,
	LiquidGetBalanceResult
>({
	confirmation: ({ review }) => ({
		data: {
			accountIdentifier: review.account.accountIdentifier,
			assetId: review.requestedAsset.assetId,
			chainId: review.account.chainId,
			kind: "liquid.getBalance",
		},
		message: "A dapp wants to read the Liquid balance for this account.",
		title: "Share Liquid balance?",
	}),
	execute: async ({ context, review }) => {
		const { account, requestedAsset } = review;

		// Snapshot-first: when a persisted portfolio snapshot exists for this account+chain, serve the
		// balance from it with no scan. A miss (cold cache, or a non-selected account that has no
		// snapshot) falls through to the live scan below; reads never trigger a sync.
		if (context.readPortfolioSnapshot && account.accountGroupId) {
			const snapshot = await context.readPortfolioSnapshot(account.accountGroupId, account.chainId);

			if (snapshot) {
				const asset = snapshot.data.assets.find(
					(entry) => entry.rawAssetId === requestedAsset.rawAssetId,
				);

				return {
					accountIdentifier: account.accountIdentifier,
					assetId: requestedAsset.assetId,
					// An asset absent from the snapshot (not held / zero balance) reads as "0".
					balance: asset?.amountSats ?? "0",
					chainId: account.chainId,
					policyAssetId: account.policyAssetId,
				};
			}
		}

		await context.walletBackend.syncAccount(account);

		return {
			accountIdentifier: account.accountIdentifier,
			assetId: requestedAsset.assetId,
			balance: context.walletBackend.getBalance(account, requestedAsset.rawAssetId),
			chainId: account.chainId,
			policyAssetId: account.policyAssetId,
		};
	},
	id: LIQUID_WALLET_RPC_METHODS.GET_BALANCE,
	parse: parseLiquidGetBalanceParams,
	review: async ({ context, params }) => {
		const account = await resolveDappAccount(context);

		return {
			account,
			requestedAsset: resolveRequestedAsset(params.assetId, account),
		};
	},
});

function resolveRequestedAsset(
	assetId: string | undefined,
	account: LiquidWalletAccount,
): ParsedLiquidAssetId {
	if (assetId) {
		return parseLiquidAssetId(assetId, account.chainId);
	}

	return {
		assetId: account.policyAssetId,
		chainId: account.chainId,
		rawAssetId: account.rawPolicyAssetId,
	};
}
