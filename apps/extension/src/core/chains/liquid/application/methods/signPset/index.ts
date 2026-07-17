import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";
import type { LiquidSignPsetResult, ParsedLiquidSignPsetParams } from "../../../domain/pset/types";
import { parseLiquidSignPsetParams } from "../../../domain/pset/validation";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../backends/LiquidWalletBackend";
import { resolveDappAccount } from "../../dappAccountScope";

export type LiquidSignPsetContext = WalletRpcBaseContext & {
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	updateKeyManagerState?: UpdateKeyManagerState;
	walletBackend: LiquidWalletBackend;
};

type LiquidSignPsetReview = {
	account: LiquidWalletAccount;
};

export const signLiquidPset = createWalletMethod<
	ParsedLiquidSignPsetParams,
	LiquidSignPsetContext,
	LiquidSignPsetReview,
	LiquidSignPsetResult
>({
	confirmation: ({ params, review }) => ({
		data: {
			accountIdentifier: review.account.accountIdentifier,
			broadcast: params.broadcast,
			chainId: review.account.chainId,
			kind: "liquid.signPset",
			requestedInputs: params.signInputs.map((input) => ({
				address: input.address,
				index: input.index,
				sighashTypes: input.sighashTypes,
			})),
			temporaryNonSelectiveSigning: true,
		},
		message: "A dapp wants to sign a Liquid PSET.",
		title: "Sign Liquid PSET?",
	}),
	execute: ({ context, params, review }) => context.walletBackend.signPset(review.account, params),
	id: LIQUID_WALLET_RPC_METHODS.SIGN_PSET,
	parse: parseLiquidSignPsetParams,
	review: async ({ context }) => ({
		account: await resolveDappAccount(context),
	}),
});
