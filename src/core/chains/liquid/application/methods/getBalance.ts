import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcConfirmationHandler } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../chains/LiquidChainRecord";
import type { ParsedLiquidAssetId } from "../../domain/LiquidAsset";
import type { LiquidGetBalanceParams, LiquidGetBalanceResult } from "../../domain/LiquidRpc";
import { parseLiquidAssetId, parseLiquidGetBalanceParams } from "../../domain/validation";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../backends/LiquidWalletBackend";

export type LiquidGetBalanceContext = {
	chain: LiquidChainRecord;
	confirm?: WalletRpcConfirmationHandler;
	keyManagerState: KeyManagerState;
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
		await context.walletBackend.syncAccount(review.account);

		return {
			accountIdentifier: review.account.accountIdentifier,
			assetId: review.requestedAsset.assetId,
			balance: context.walletBackend.getBalance(review.account, review.requestedAsset.rawAssetId),
			chainId: review.account.chainId,
			policyAssetId: review.account.policyAssetId,
		};
	},
	parse: parseLiquidGetBalanceParams,
	review: async ({ context, params }) => {
		const account = await context.walletBackend.resolveAccount({
			chain: context.chain,
			keyManagerState: context.keyManagerState,
			updateKeyManagerState: context.updateKeyManagerState,
		});

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
