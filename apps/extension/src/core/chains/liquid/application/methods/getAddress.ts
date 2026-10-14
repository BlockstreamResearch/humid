import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../chains/LiquidChainRecord";
import { LIQUID_WALLET_RPC_METHODS, type LiquidGetAddressResult } from "../../domain/LiquidRpc";
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
	undefined,
	LiquidGetAddressContext,
	LiquidGetAddressReview,
	LiquidGetAddressResult
>({
	confirmation: ({ review }) => ({
		data: {
			accountIdentifier: review.account.accountIdentifier,
			chainId: review.account.chainId,
			kind: "liquid.getAddress",
		},
		message: "A dapp wants to read the first Liquid address of this account.",
		title: "Share Liquid address?",
	}),
	execute: ({ context, review }) => {
		const { account } = review;
		const { address, index, unconfidential } = context.walletBackend.getSigningAddress(account);

		return {
			accountIdentifier: account.accountIdentifier,
			address,
			chainId: account.chainId,
			index,
			unconfidentialAddress: unconfidential,
		};
	},
	id: LIQUID_WALLET_RPC_METHODS.GET_ADDRESS,
	parse: parseLiquidGetAddressParams,
	review: async ({ context }) => ({
		account: await resolveDappAccount(context),
	}),
});
