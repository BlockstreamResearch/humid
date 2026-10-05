import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";
import type {
	LiquidSignPsetResult,
	LiquidSignPsetReview,
	ParsedLiquidSignPsetParams,
} from "../../../domain/pset/types";
import { parseLiquidSignPsetParams } from "../../../domain/pset/validation";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../backends/LiquidWalletBackend";
import { resolveDappAccount } from "../../dappAccountScope";

export type LiquidSignPsetContext = WalletRpcBaseContext & {
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	updateKeyManagerState?: UpdateKeyManagerState;
	walletBackend: LiquidWalletBackend;
};

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
	confirmation: ({ params, review }) => ({
		confirmLabel: params.broadcast ? "Sign and send" : "Sign",
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
			transaction: review.transaction,
		},
		message: [
			params.broadcast
				? "Sign and broadcast this transaction."
				: "Return the signed PSET to the app; do not broadcast.",
			`Network: ${review.account.chainId}\nAccount: ${review.account.accountIdentifier}`,
			"Requested signing inputs:\n" +
				params.signInputs
					.map(
						(input) =>
							`Input ${input.index}: ${input.address}\nRequested sighash allowances: ${input.sighashTypes.map((type) => `0x${type.toString(16)}`).join(", ")}`,
					)
					.join("\n"),
			"Effective PSET input sighashes:\n" +
				review.transaction.inputs
					.map((input) => {
						const requested = params.signInputs.find((item) => item.index === input.index);
						return `Input ${input.index}: 0x${input.sighashType.toString(16)} (${input.sighashType})\n${sighashMeaning(input.sighashType)}${
							requested && !requested.sighashTypes.includes(input.sighashType)
								? "\nWarning: the effective sighash differs from the app's requested allowances. Signing uses the effective PSET sighash shown here, not those allowances."
								: ""
						}`;
					})
					.join("\n\n"),
			"Wallet net change (base units):\n" +
				(review.transaction.netEffect.map((row) => `${row.amount} · ${row.asset}`).join("\n") ||
					"No wallet balance change"),
			"Transaction fees (base units):\n" +
				(review.transaction.fees.map((row) => `${row.amount} · ${row.asset}`).join("\n") ||
					"No fee outputs"),
			...review.transaction.outputs.map(
				(output) =>
					`Output ${output.index}${output.script === "" ? " (fee)" : ""}:\n${output.address ?? ""}\n${output.amount ?? "Confidential amount unavailable"} · ${output.asset ?? "Confidential asset unavailable"}\nScript: ${output.script}`,
			),
			`Reviewed PSET to sign (base64):\n${review.transaction.pset}`,
		].join("\n\n"),
		title: "Sign Liquid PSET?",
	}),
	execute: ({ context, params, review }) =>
		context.walletBackend.signPset(review.account, {
			broadcast: params.broadcast,
			reviewedPset: review.transaction.pset,
			signInputs: params.signInputs,
		}),
	id: LIQUID_WALLET_RPC_METHODS.SIGN_PSET,
	parse: parseLiquidSignPsetParams,
	review: async ({ context, params }) => {
		const account = await resolveDappAccount(context);
		await context.walletBackend.syncAccount(account);
		const transaction = await context.walletBackend.blindAndInspectPset(account, params.pset);
		return { account, transaction };
	},
});

function sighashMeaning(type: number): string {
	const scope =
		[
			"Nonstandard sighash base type.",
			"ALL: commits to all outputs.",
			"NONE: does not commit to outputs.",
			"SINGLE: commits to the output at this input index.",
		][type & 0x1f] ?? "Nonstandard sighash base type.";
	return `${scope} ${type & 0x80 ? "ANYONECANPAY: commits only to this input." : "Commits to all inputs."}`;
}
