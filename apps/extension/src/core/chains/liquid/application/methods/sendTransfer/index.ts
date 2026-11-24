import { transferChanges } from "@/common/Confirmation/TransactionReceipt";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";

import { liquidChainLabel } from "../../../chains/LiquidChainRecord";
import type { ParsedLiquidAssetId } from "../../../domain/LiquidAsset";
import {
	LIQUID_WALLET_RPC_METHODS,
	type ParsedLiquidSendTransferParams,
	type LiquidSendTransferResult,
	type LiquidTransferReview,
} from "../../../domain/LiquidRpc";
import { parseLiquidSendTransferParams } from "../../../domain/validation";
import type { LiquidWalletAccount } from "../../backends/LiquidWalletBackend";
import { accountNameOf, readKnownAssets, transactionReceipt } from "../../confirmationFacts";
import { resolveDappAccount } from "../../dappAccountScope";
import {
	chosenTargetBlocks,
	quoteTransferSpeeds,
	readSpeedRates,
	type SpeedQuote,
} from "../../feeSpeeds";
import type { LiquidRpcMethodContext } from "../../LiquidRpcContext";
import { resolveRequestedAsset } from "../../requestedAsset";
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
	ParsedLiquidSendTransferParams,
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
			network: liquidChainLabel(context.chain),
			review: {
				quotes: review.quotes,
				recipientAddress: review.transfer.recipientAddress,
				recipientConfidential: review.transfer.recipientConfidential,
			},
		} satisfies SendTransferConfirmationData,
		title: "Send a transfer?",
	}),
	execute: ({ choice, context, params, review }) => {
		const quote = chosenQuote(review, choice);

		return context.walletBackend.sendTransfer(
			review.account,
			params,
			review.requestedAsset.rawAssetId,
			{ feeRateSatsPerKvb: quote.feeRateSatsPerKvb, feeSats: quote.feeSats },
			{ action: "Send", origin: context.requester?.origin ?? "" },
		);
	},
	id: LIQUID_WALLET_RPC_METHODS.SEND_TRANSFER,
	parse: parseLiquidSendTransferParams,
	receipt: ({ choice, context, result, review }) => {
		const { amount, feeSats } = chosenQuote(review, choice);

		return transactionReceipt(context, review.account, {
			changes: transferChanges({
				amount,
				asset: review.requestedAsset.rawAssetId,
				feeAsset: review.account.rawPolicyAssetId,
				feeSats,
			}),
			feeSats,
			txid: result.txid,
		});
	},
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
	spends: true,
});

function chosenQuote(review: LiquidSendTransferMethodReview, choice: unknown): SpeedQuote {
	const targetBlocks = chosenTargetBlocks(choice);

	return review.quotes.find((candidate) => candidate.targetBlocks === targetBlocks)!;
}
