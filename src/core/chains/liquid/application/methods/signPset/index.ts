import type { KeyManagerState } from "@/core/key-manager/types";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
	WalletRpcUserRejectedError,
} from "@/core/wallet-rpc/errors";

import type { LiquidChainId } from "../../../domain/LiquidChain";
import type { LiquidSignPsetResult, ParsedLiquidSignPsetParams } from "../../../domain/pset/types";
import { parseLiquidSignPsetParams } from "../../../domain/pset/validation";
import type { ConfirmationPort } from "../../../ports/ConfirmationPort";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../../ports/LiquidWalletBackend";

export type LiquidSignPsetContext = {
	chainId: LiquidChainId;
	confirm?: ConfirmationPort;
	keyManagerState: KeyManagerState;
	walletBackend: LiquidWalletBackend;
};

export async function signLiquidPset(
	params: unknown,
	context: LiquidSignPsetContext,
): Promise<LiquidSignPsetResult> {
	const parsedParams = parseLiquidSignPsetParams(params);
	const account = await context.walletBackend.resolveAccount({
		chainId: context.chainId,
		keyManagerState: context.keyManagerState,
	});

	await requirePsetSigningConfirmation(context, account, parsedParams);

	return context.walletBackend.signPset(account, parsedParams);
}

async function requirePsetSigningConfirmation(
	context: LiquidSignPsetContext,
	account: LiquidWalletAccount,
	params: ParsedLiquidSignPsetParams,
): Promise<void> {
	if (!context.confirm) {
		throw new WalletRpcResourceUnavailableError(
			"PSET signing requires a confirmation surface.",
			undefined,
			WALLET_RPC_ERROR_REASONS.CONFIRMATION_UNAVAILABLE,
		);
	}

	const confirmed = await context.confirm({
		data: {
			accountIdentifier: account.accountIdentifier,
			broadcast: params.broadcast,
			chainId: account.chainId,
			requestedInputs: params.signInputs.map((input) => ({
				address: input.address,
				index: input.index,
				sighashTypes: input.sighashTypes,
			})),
			temporaryNonSelectiveSigning: true,
		},
		message: "A dapp wants to sign a Liquid PSET.",
		title: "Sign Liquid PSET?",
	});

	if (!confirmed) {
		throw new WalletRpcUserRejectedError();
	}
}
