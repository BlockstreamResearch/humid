import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../chains/LiquidChainRecord";
import {
	LIQUID_WALLET_RPC_METHODS,
	type LiquidGetAddressParams,
	type LiquidGetAddressResult,
} from "../../domain/LiquidRpc";
import { parseLiquidGetAddressParams } from "../../domain/validation";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../backends/LiquidWalletBackend";
import { resolveDappAccount } from "../dappAccountScope";

export type LiquidGetAddressContext = WalletRpcBaseContext & {
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	updateKeyManagerState?: UpdateKeyManagerState;
	walletBackend: LiquidWalletBackend;
};

type LiquidGetAddressReview = {
	account: LiquidWalletAccount;
};

export const getLiquidAddress = createWalletMethod<
	LiquidGetAddressParams,
	LiquidGetAddressContext,
	LiquidGetAddressReview,
	LiquidGetAddressResult
>({
	confirmation: ({ params, review }) => ({
		data: {
			accountIdentifier: review.account.accountIdentifier,
			chainId: review.account.chainId,
			confidential: params.confidential,
			index: params.index,
			kind: "liquid.getAddress",
		},
		message: `A dapp wants to read the ${params.confidential ? "confidential" : "unconfidential"} Liquid address #${params.index} of this account.`,
		title: "Share Liquid address?",
	}),
	execute: ({ context, params, review }) => {
		const { account } = review;
		const { address, unconfidential } = context.walletBackend.getAddress(account, params.index);

		return {
			accountIdentifier: account.accountIdentifier,
			address: params.confidential ? address : unconfidential,
			chainId: account.chainId,
			confidential: params.confidential,
			index: params.index,
		};
	},
	id: LIQUID_WALLET_RPC_METHODS.GET_ADDRESS,
	parse: parseLiquidGetAddressParams,
	review: async ({ context }) => ({
		account: await resolveDappAccount(context),
	}),
});
