import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import type { ParsedLiquidAssetId } from "../../../domain/LiquidAsset";
import {
	LIQUID_WALLET_RPC_METHODS,
	type LiquidSendTransferParams,
	type LiquidSendTransferResult,
	type LiquidTransferReview,
} from "../../../domain/LiquidRpc";
import { parseLiquidAssetId, parseLiquidSendTransferParams } from "../../../domain/validation";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../backends/LiquidWalletBackend";
import { resolveDappAccount } from "../../dappAccountScope";

export type LiquidSendTransferContext = WalletRpcBaseContext & {
	chain: LiquidChainRecord;
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
	id: LIQUID_WALLET_RPC_METHODS.SEND_TRANSFER,
	parse: parseLiquidSendTransferParams,
	review: async ({ context, params }) => {
		const account = await resolveDappAccount(context, params.account);
		const requestedAsset = resolveRequestedAsset(params.assetId, account);

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
