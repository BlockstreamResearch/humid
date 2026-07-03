import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { WALLET_CAPABILITY_GROUPS } from "@/core/wallet-methods/capability";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcConfirmationHandler } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import type { ParsedLiquidAssetId } from "../../../domain/LiquidAsset";
import {
	LIQUID_WALLET_RPC_METHODS,
	type LiquidGetUTXOsParams,
	type LiquidGetUTXOsResult,
} from "../../../domain/LiquidRpc";
import { parseLiquidAssetId, parseLiquidGetUTXOsParams } from "../../../domain/validation";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../backends/LiquidWalletBackend";

export type LiquidGetUTXOsContext = {
	chain: LiquidChainRecord;
	confirm?: WalletRpcConfirmationHandler;
	keyManagerState: KeyManagerState;
	updateKeyManagerState?: UpdateKeyManagerState;
	walletBackend: LiquidWalletBackend;
};

type LiquidGetUTXOsReview = {
	account: LiquidWalletAccount;
	requestedAsset: ParsedLiquidAssetId;
};

export const getLiquidUTXOs = createWalletMethod<
	LiquidGetUTXOsParams,
	LiquidGetUTXOsContext,
	LiquidGetUTXOsReview,
	LiquidGetUTXOsResult
>({
	capability: {
		access: "read",
		description: "See this account's individual coins (unspent outputs).",
		group: WALLET_CAPABILITY_GROUPS.VIEW_BALANCES,
		id: LIQUID_WALLET_RPC_METHODS.GET_UTXOS,
		label: "View coins",
	},
	confirmation: ({ review }) => ({
		data: {
			accountIdentifier: review.account.accountIdentifier,
			assetId: review.requestedAsset.assetId,
			chainId: review.account.chainId,
			kind: "liquid.getUTXOs",
		},
		message: "A dapp wants to read the Liquid UTXOs for this account.",
		title: "Share Liquid UTXOs?",
	}),
	execute: async ({ context, review }) => {
		await context.walletBackend.syncAccount(review.account);

		return {
			accountIdentifier: review.account.accountIdentifier,
			assetId: review.requestedAsset.assetId,
			chainId: review.account.chainId,
			policyAssetId: review.account.policyAssetId,
			utxos: context.walletBackend.getUtxos(review.account, review.requestedAsset.rawAssetId),
		};
	},
	parse: parseLiquidGetUTXOsParams,
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
