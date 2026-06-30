import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";
import type { WalletRpcConfirmationHandler } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import type { ParsedLiquidAssetId } from "../../../domain/LiquidAsset";
import type {
	LiquidSendTransferParams,
	LiquidSendTransferResult,
	LiquidTransferReview,
} from "../../../domain/LiquidRpc";
import { parseLiquidAssetId, parseLiquidSendTransferParams } from "../../../domain/validation";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../backends/LiquidWalletBackend";

export type LiquidSendTransferContext = {
	chain: LiquidChainRecord;
	confirm?: WalletRpcConfirmationHandler;
	keyManagerState: KeyManagerState;
	updateKeyManagerState?: UpdateKeyManagerState;
	walletBackend: LiquidWalletBackend;
};

type LiquidSendTransferMethodReview = {
	account: LiquidWalletAccount;
	requestedAsset: ParsedLiquidAssetId;
	transfer: LiquidTransferReview;
};

export const sendLiquidTransfer = createWalletMethod<
	LiquidSendTransferParams,
	LiquidSendTransferContext,
	LiquidSendTransferMethodReview,
	LiquidSendTransferResult
>({
	confirmation: ({ review }) => ({
		data: {
			...review.transfer,
			kind: "liquid.sendTransfer",
		},
		message: review.transfer.recipientConfidential
			? "A dapp wants to send a Liquid transfer from this account."
			: "A dapp wants to send a Liquid transfer to an unconfidential address.",
		title: "Send Liquid transfer?",
	}),
	execute: ({ context, params, review }) =>
		context.walletBackend.sendTransfer(review.account, params, review.requestedAsset.rawAssetId),
	parse: parseLiquidSendTransferParams,
	review: async ({ context, params }) => {
		const account = await context.walletBackend.resolveAccount({
			chain: context.chain,
			keyManagerState: context.keyManagerState,
			updateKeyManagerState: context.updateKeyManagerState,
		});
		const requestedAsset = resolveRequestedAsset(params.assetId, account);

		if (params.account && params.account !== account.accountIdentifier) {
			throw new WalletRpcInvalidParamsError(
				"Requested account does not match the connected Liquid account.",
				{
					connectedAccount: account.accountIdentifier,
					requestedAccount: params.account,
				},
				WALLET_RPC_ERROR_REASONS.ACCOUNT_MISMATCH,
			);
		}

		await context.walletBackend.syncAccount(account);

		return {
			account,
			requestedAsset,
			transfer: await context.walletBackend.inspectTransfer(
				account,
				params,
				requestedAsset.rawAssetId,
			),
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
