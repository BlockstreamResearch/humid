import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { WALLET_CAPABILITY_GROUPS } from "@/core/wallet-methods/capability";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";
import type { WalletRpcConfirmationHandler } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";
import {
	LIQUID_SIGN_MESSAGE_PROTOCOLS,
	type LiquidSignMessageResult,
	type LiquidSignMessageReview,
	type ParsedLiquidSignMessageParams,
} from "../../../domain/message/types";
import { parseLiquidSignMessageParams } from "../../../domain/message/validation";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../backends/LiquidWalletBackend";

export type LiquidSignMessageContext = {
	chain: LiquidChainRecord;
	confirm?: WalletRpcConfirmationHandler;
	keyManagerState: KeyManagerState;
	updateKeyManagerState?: UpdateKeyManagerState;
	walletBackend: LiquidWalletBackend;
};

type LiquidSignMessageMethodReview = {
	account: LiquidWalletAccount;
	message: LiquidSignMessageReview;
};

export const signLiquidMessage = createWalletMethod<
	ParsedLiquidSignMessageParams,
	LiquidSignMessageContext,
	LiquidSignMessageMethodReview,
	LiquidSignMessageResult
>({
	capability: {
		access: "action",
		description: "Sign arbitrary messages with this account.",
		group: WALLET_CAPABILITY_GROUPS.SIGN_MESSAGES,
		id: LIQUID_WALLET_RPC_METHODS.SIGN_MESSAGE,
		label: "Sign messages",
	},
	confirmation: ({ params, review }) => ({
		data: {
			accountIdentifier: review.message.accountIdentifier,
			address: review.message.address,
			chainId: review.message.chainId,
			kind: "liquid.signMessage",
			message: params.message,
			protocol: review.message.protocol,
		},
		message: "A dapp wants to sign a Liquid message.",
		title: "Sign Liquid message?",
	}),
	execute: ({ context, params, review }) =>
		context.walletBackend.signMessage(review.account, params),
	parse: parseSignMessageParams,
	review: async ({ context, params }) => {
		const account = await context.walletBackend.resolveAccount({
			chain: context.chain,
			keyManagerState: context.keyManagerState,
			updateKeyManagerState: context.updateKeyManagerState,
		});

		return {
			account,
			message: await context.walletBackend.inspectMessageSigning(account, params),
		};
	},
});

function parseSignMessageParams(params: unknown): ParsedLiquidSignMessageParams {
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

	return parsedParams;
}
