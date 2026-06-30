import type { KeyManagerState } from "@/core/key-manager/types";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcInvalidParamsError,
	WalletRpcResourceUnavailableError,
	WalletRpcUserRejectedError,
} from "@/core/wallet-rpc/errors";

import type { LiquidChainId } from "../../../domain/LiquidChain";
import {
	LIQUID_SIGN_MESSAGE_PROTOCOLS,
	type LiquidSignMessageResult,
	type LiquidSignMessageReview,
	type ParsedLiquidSignMessageParams,
} from "../../../domain/message/types";
import { parseLiquidSignMessageParams } from "../../../domain/message/validation";
import type { ConfirmationPort } from "../../../ports/ConfirmationPort";
import type { LiquidWalletBackend } from "../../../ports/LiquidWalletBackend";

export type LiquidSignMessageContext = {
	chainId: LiquidChainId;
	confirm?: ConfirmationPort;
	keyManagerState: KeyManagerState;
	walletBackend: LiquidWalletBackend;
};

export async function signLiquidMessage(
	params: unknown,
	context: LiquidSignMessageContext,
): Promise<LiquidSignMessageResult> {
	const parsedParams = parseLiquidSignMessageParams(params);

	if (parsedParams.protocol !== LIQUID_SIGN_MESSAGE_PROTOCOLS.ECDSA) {
		throw new WalletRpcInvalidParamsError(
			"Unsupported Liquid message signing protocol.",
			{
				protocol: parsedParams.protocol,
				supportedProtocols: [LIQUID_SIGN_MESSAGE_PROTOCOLS.ECDSA],
			},
			WALLET_RPC_ERROR_REASONS.UNSUPPORTED_MESSAGE_SIGNING_PROTOCOL,
		);
	}

	const account = await context.walletBackend.resolveAccount({
		chainId: context.chainId,
		keyManagerState: context.keyManagerState,
	});
	const review = await context.walletBackend.inspectMessageSigning(account, parsedParams);

	await requireMessageSigningConfirmation(context, review, parsedParams);

	return context.walletBackend.signMessage(account, parsedParams);
}

async function requireMessageSigningConfirmation(
	context: LiquidSignMessageContext,
	review: LiquidSignMessageReview,
	params: ParsedLiquidSignMessageParams,
): Promise<void> {
	if (!context.confirm) {
		throw new WalletRpcResourceUnavailableError(
			"Message signing requires a confirmation surface.",
			undefined,
			WALLET_RPC_ERROR_REASONS.CONFIRMATION_UNAVAILABLE,
		);
	}

	const confirmed = await context.confirm({
		data: {
			accountIdentifier: review.accountIdentifier,
			address: review.address,
			chainId: review.chainId,
			message: params.message,
			protocol: review.protocol,
		},
		message: "A dapp wants to sign a Liquid message.",
		title: "Sign Liquid message?",
	});

	if (!confirmed) {
		throw new WalletRpcUserRejectedError();
	}
}
