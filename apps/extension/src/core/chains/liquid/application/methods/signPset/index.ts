import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";

import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";
import type {
	LiquidSignPsetResult,
	LiquidSignPsetReview,
	ParsedLiquidSignPsetParams,
} from "../../../domain/pset/types";
import { parseLiquidSignPsetParams } from "../../../domain/pset/validation";
import type { LiquidWalletAccount } from "../../backends/LiquidWalletBackend";
import { accountNameOf, readKnownAssets, transactionReceipt } from "../../confirmationFacts";
import { resolveDappAccount } from "../../dappAccountScope";
import type { LiquidRpcMethodContext } from "../../LiquidRpcContext";
import { heldCoins } from "../../signedHold";
import { SIGN_PSET_CONFIRMATION_KIND, type SignPsetConfirmationData } from "./SignPsetConfirmation";

export type LiquidSignPsetContext = LiquidRpcMethodContext;

type LiquidSignPsetMethodReview = {
	account: LiquidWalletAccount;
	transaction: LiquidSignPsetReview;
};

export const signLiquidPset = createWalletMethod<
	ParsedLiquidSignPsetParams,
	LiquidSignPsetContext,
	LiquidSignPsetMethodReview,
	LiquidSignPsetResult
>({
	confirmation: async ({ context, params, review }) => {
		const { pset: _pset, ...transaction } = review.transaction;

		return {
			confirmLabel: params.broadcast ? "Sign and send" : "Sign",
			data: {
				account: accountNameOf(context, review.account),
				assets: await readKnownAssets(context, review.account),
				broadcast: params.broadcast,
				kind: SIGN_PSET_CONFIRMATION_KIND,
				network: context.chain.name,
				policyAssetId: review.account.rawPolicyAssetId,
				signInputs: params.signInputs.map((input) => input.index),
				transaction,
			} satisfies SignPsetConfirmationData,
			title: "Sign a transaction?",
		};
	},
	execute: ({ context, params, review }) =>
		context.walletBackend.signPset(
			review.account,
			{
				broadcast: params.broadcast,
				reviewedPset: review.transaction.pset,
				signInputs: params.signInputs,
			},
			{
				action: "Signed transaction",
				holding: heldCoins(review.transaction.inputs.filter(({ owned }) => owned)),
				origin: context.requester?.origin ?? "",
			},
		),
	id: LIQUID_WALLET_RPC_METHODS.SIGN_PSET,
	parse: parseLiquidSignPsetParams,
	receipt: ({ context, result, review }) =>
		transactionReceipt(context, review.account, {
			changes: review.transaction.netEffect,
			feeSats:
				review.transaction.fees.find((fee) => fee.asset === review.account.rawPolicyAssetId)
					?.amount ?? "0",
			txid: result.txid,
		}),
	review: async ({ context, params }) => {
		const account = await resolveDappAccount(context);
		await context.walletBackend.syncAccount(account);
		const transaction = await context.walletBackend.blindAndInspectPset(account, params.pset);
		return { account, transaction };
	},
});
