import type { KeyManagerState } from "@/core/key-manager/types";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
	WalletRpcUserRejectedError,
} from "@/core/wallet-rpc/errors";

import type { LiquidGetIdentityPublicKeyResult } from "../../../domain/identity/types";
import { parseLiquidGetIdentityPublicKeyParams } from "../../../domain/identity/validation";
import type { LiquidChainId } from "../../../domain/LiquidChain";
import type { ConfirmationPort } from "../../../ports/ConfirmationPort";
import type { LiquidIdentityBackend } from "../../../ports/LiquidIdentityBackend";

export type LiquidGetIdentityPublicKeyContext = {
	chainId: LiquidChainId;
	confirm?: ConfirmationPort;
	identityBackend: LiquidIdentityBackend;
	keyManagerState: KeyManagerState;
};

export async function getLiquidIdentityPublicKey(
	params: unknown,
	context: LiquidGetIdentityPublicKeyContext,
): Promise<LiquidGetIdentityPublicKeyResult> {
	const parsedParams = parseLiquidGetIdentityPublicKeyParams(params);

	await requireIdentityPublicKeyDisclosureConfirmation(context, parsedParams);

	return context.identityBackend.getIdentityPublicKey({
		...parsedParams,
		keyManagerState: context.keyManagerState,
	});
}

async function requireIdentityPublicKeyDisclosureConfirmation(
	context: LiquidGetIdentityPublicKeyContext,
	params: ReturnType<typeof parseLiquidGetIdentityPublicKeyParams>,
): Promise<void> {
	if (!context.confirm) {
		throw new WalletRpcResourceUnavailableError(
			"Identity public key disclosure requires a confirmation surface.",
			undefined,
			WALLET_RPC_ERROR_REASONS.CONFIRMATION_UNAVAILABLE,
		);
	}

	const confirmed = await context.confirm({
		data: {
			chainId: context.chainId,
			curve: params.curve,
			identity: params.identity,
			index: params.index,
		},
		message: "A dapp wants to read a deterministic Liquid identity public key.",
		title: "Share Liquid identity public key?",
	});

	if (!confirmed) {
		throw new WalletRpcUserRejectedError();
	}
}
