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
		confirmLabel: "Sign and send",
		data: {
			...review.transfer,
			kind: "liquid.sendTransfer",
		},
		message: [
			"This transfer will be signed and broadcast.",
			`Network: ${review.transfer.chainId}\nAccount: ${review.transfer.accountIdentifier}`,
			`Recipient: ${review.transfer.recipientAddress}`,
			`Amount (base units): ${review.transfer.amount}\nAsset: ${review.transfer.assetId}`,
			review.transfer.memo === undefined ? "" : `Memo:\n${review.transfer.memo}`,
			review.transfer.recipientConfidential
				? ""
				: "Warning: this recipient is unconfidential; the amount and asset will be publicly visible.",
		]
			.filter(Boolean)
			.join("\n\n"),
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

		const transfer = await context.walletBackend.inspectTransfer(
			account,
			params,
			requestedAsset.rawAssetId,
		);
		return { account, requestedAsset, transfer };
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
