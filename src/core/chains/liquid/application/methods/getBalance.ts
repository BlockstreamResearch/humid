import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { WALLET_CAPABILITY_GROUPS } from "@/core/wallet-methods/capability";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcConfirmationHandler } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../chains/LiquidChainRecord";
import { restrictedLiquidAssetId, type ParsedLiquidAssetId } from "../../domain/LiquidAsset";
import {
	LIQUID_WALLET_RPC_METHODS,
	type LiquidGetBalanceParams,
	type LiquidGetBalanceResult,
} from "../../domain/LiquidRpc";
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
	capability: {
		access: "read",
		description: "See this account's asset balances.",
		group: WALLET_CAPABILITY_GROUPS.VIEW_BALANCES,
		id: LIQUID_WALLET_RPC_METHODS.GET_BALANCE,
		label: "View balance",
		restricted: ({ context, params }) => ({
			accountIdentifier: "",
			assetId: params.assetId ?? restrictedLiquidAssetId(context.chain.id),
			balance: "RESTRICTED",
			chainId: context.chain.id,
			policyAssetId: restrictedLiquidAssetId(context.chain.id),
		}),
	},
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
