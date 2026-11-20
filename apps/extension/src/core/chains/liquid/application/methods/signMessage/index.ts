import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

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
import { resolveDappAccount } from "../../dappAccountScope";
import {
	SIGN_MESSAGE_CONFIRMATION_KIND,
	type SignMessageConfirmationData,
} from "./SignMessageConfirmation";

export type LiquidSignMessageContext = WalletRpcBaseContext & {
	chain: LiquidChainRecord;
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
	confirmation: ({ context, params, review }) => ({
		confirmLabel: "Sign",
		data: {
			address: review.message.address,
			kind: SIGN_MESSAGE_CONFIRMATION_KIND,
			message: params.message,
			network: context.chain.name,
			protocol: review.message.protocol,
		} satisfies SignMessageConfirmationData,
		title: "Sign a message?",
	}),
	execute: ({ context, params, review }) =>
		context.walletBackend.signMessage(review.account, params),
	id: LIQUID_WALLET_RPC_METHODS.SIGN_MESSAGE,
	parse: parseSignMessageParams,
	review: async ({ context, params }) => {
		const account = await resolveDappAccount(context);

		const message = await context.walletBackend.inspectMessageSigning(account, params);
		return { account, message };
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
