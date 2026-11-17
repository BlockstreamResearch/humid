import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";

import type { ParsedLiquidAssetId } from "../../../domain/LiquidAsset";
import {
	LIQUID_WALLET_RPC_METHODS,
	type LiquidSendTransferParams,
	type LiquidSendTransferResult,
	type LiquidTransferReview,
} from "../../../domain/LiquidRpc";
import { parseLiquidAssetId, parseLiquidSendTransferParams } from "../../../domain/validation";
import type { LiquidWalletAccount } from "../../backends/LiquidWalletBackend";
import { accountNameOf, readKnownAssets } from "../../confirmationFacts";
import { resolveDappAccount } from "../../dappAccountScope";
import {
	chosenTargetBlocks,
	quoteTransferSpeeds,
	readSpeedRates,
	type SpeedQuote,
} from "../../feeSpeeds";
import type { LiquidRpcMethodContext } from "../../LiquidRpcContext";
import {
	SEND_TRANSFER_CONFIRMATION_KIND,
	type SendTransferConfirmationData,
} from "./SendTransferConfirmation";

export type LiquidSendTransferContext = LiquidRpcMethodContext;

type LiquidSendTransferMethodReview = {
	account: LiquidWalletAccount;
	quotes: SpeedQuote[];
	requestedAsset: ParsedLiquidAssetId;
	transfer: LiquidTransferReview;
};

export const sendLiquidTransfer = createWalletMethod<
	LiquidSendTransferParams,
	LiquidSendTransferContext,
	LiquidSendTransferMethodReview,
	LiquidSendTransferResult
>({
	confirmation: async ({ context, review }) => ({
		confirmLabel: "Send",
		data: {
			account: accountNameOf(context, review.account),
			assetId: review.requestedAsset.rawAssetId,
			assets: await readKnownAssets(context, review.account),
			feeAssetId: review.account.rawPolicyAssetId,
			kind: SEND_TRANSFER_CONFIRMATION_KIND,
			network: context.chain.name,
			review: {
				quotes: review.quotes,
				recipientAddress: review.transfer.recipientAddress,
				recipientConfidential: review.transfer.recipientConfidential,
			},
		} satisfies SendTransferConfirmationData,
		title: "Send a transfer?",
	}),
	execute: ({ choice, context, params, review }) => {
		const targetBlocks = chosenTargetBlocks(choice);
		const quote = review.quotes.find((candidate) => candidate.targetBlocks === targetBlocks)!;

		return context.walletBackend.sendTransfer(
			review.account,
			params,
			review.requestedAsset.rawAssetId,
			{ feeRateSatsPerKvb: quote.feeRateSatsPerKvb, feeSats: quote.feeSats },
		);
	},
	id: LIQUID_WALLET_RPC_METHODS.SEND_TRANSFER,
	parse: parseLiquidSendTransferParams,
	review: async ({ context, params }) => {
		const account = await resolveDappAccount(context, params.account);
		const requestedAsset = resolveRequestedAsset(params.assetId, account);

		await context.walletBackend.syncAccount(account);

		const transfer = await context.walletBackend.inspectTransfer(
			account,
			params,
			requestedAsset.rawAssetId,
		);
		const quotes = await quoteTransferSpeeds(
			context.walletBackend,
			account,
			params,
			requestedAsset.rawAssetId,
			await readSpeedRates(context.chain),
		);

		return { account, quotes, requestedAsset, transfer };
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
