import type { KeyManagerState } from "@/core/key-manager/types";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcInvalidParamsError,
	WalletRpcResourceUnavailableError,
	WalletRpcUserRejectedError,
} from "@/core/wallet-rpc/errors";

import type { ParsedLiquidAssetId } from "../../../domain/LiquidAsset";
import type { LiquidChainId } from "../../../domain/LiquidChain";
import type { LiquidSendTransferResult, LiquidTransferReview } from "../../../domain/LiquidRpc";
import { parseLiquidAssetId, parseLiquidSendTransferParams } from "../../../domain/validation";
import type { ConfirmationPort } from "../../../ports/ConfirmationPort";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../../ports/LiquidWalletBackend";

export type LiquidSendTransferContext = {
	chainId: LiquidChainId;
	confirm?: ConfirmationPort;
	keyManagerState: KeyManagerState;
	walletBackend: LiquidWalletBackend;
};

export async function sendLiquidTransfer(
	params: unknown,
	context: LiquidSendTransferContext,
): Promise<LiquidSendTransferResult> {
	const parsedParams = parseLiquidSendTransferParams(params);
	const account = await context.walletBackend.resolveAccount({
		chainId: context.chainId,
		keyManagerState: context.keyManagerState,
	});
	const requestedAsset = resolveRequestedAsset(parsedParams.assetId, account);

	if (parsedParams.account && parsedParams.account !== account.accountIdentifier) {
		throw new WalletRpcInvalidParamsError(
			"Requested account does not match the connected Liquid account.",
			{
				connectedAccount: account.accountIdentifier,
				requestedAccount: parsedParams.account,
			},
			WALLET_RPC_ERROR_REASONS.ACCOUNT_MISMATCH,
		);
	}

	await context.walletBackend.syncAccount(account);

	const review = await context.walletBackend.inspectTransfer(
		account,
		parsedParams,
		requestedAsset.rawAssetId,
	);

	await requireTransferConfirmation(context, review);

	return context.walletBackend.sendTransfer(account, parsedParams, requestedAsset.rawAssetId);
}

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

async function requireTransferConfirmation(
	context: LiquidSendTransferContext,
	review: LiquidTransferReview,
): Promise<void> {
	if (!context.confirm) {
		throw new WalletRpcResourceUnavailableError(
			"Liquid transfer requires a confirmation surface.",
			undefined,
			WALLET_RPC_ERROR_REASONS.CONFIRMATION_UNAVAILABLE,
		);
	}

	const confirmed = await context.confirm({
		data: review,
		message: review.recipientConfidential
			? "A dapp wants to send a Liquid transfer from this account."
			: "A dapp wants to send a Liquid transfer to an unconfidential address.",
		title: "Send Liquid transfer?",
	});

	if (!confirmed) {
		throw new WalletRpcUserRejectedError();
	}
}
