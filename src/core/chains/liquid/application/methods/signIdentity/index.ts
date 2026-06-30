import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { KeyManagerState } from "@/core/key-manager/types";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
	WalletRpcUserRejectedError,
} from "@/core/wallet-rpc/errors";

import {
	type LiquidSignIdentityResult,
	type ParsedLiquidSignIdentityParams,
} from "../../../domain/identity/types";
import { parseLiquidSignIdentityParams } from "../../../domain/identity/validation";
import type { LiquidChainId } from "../../../domain/LiquidChain";
import type { ConfirmationPort } from "../../../ports/ConfirmationPort";
import type { LiquidIdentityBackend } from "../../../ports/LiquidIdentityBackend";

export type LiquidSignIdentityContext = {
	chainId: LiquidChainId;
	confirm?: ConfirmationPort;
	identityBackend: LiquidIdentityBackend;
	keyManagerState: KeyManagerState;
};

export async function signLiquidIdentity(
	params: unknown,
	context: LiquidSignIdentityContext,
): Promise<LiquidSignIdentityResult> {
	const parsedParams = parseLiquidSignIdentityParams(params);

	await requireSignIdentityConfirmation(context, parsedParams);

	return context.identityBackend.signIdentity({
		...parsedParams,
		keyManagerState: context.keyManagerState,
	});
}

async function requireSignIdentityConfirmation(
	context: LiquidSignIdentityContext,
	params: ParsedLiquidSignIdentityParams,
): Promise<void> {
	if (!context.confirm) {
		throw new WalletRpcResourceUnavailableError(
			"Identity signing requires a confirmation surface.",
			undefined,
			WALLET_RPC_ERROR_REASONS.CONFIRMATION_UNAVAILABLE,
		);
	}

	const confirmed = await context.confirm({
		data: {
			chainId: context.chainId,
			challengeFingerprint: fingerprintChallenge(params.challenge),
			curve: params.curve,
			identity: params.identity,
			index: params.index,
		},
		message: "A dapp wants to sign an identity challenge.",
		title: "Sign Liquid identity challenge?",
	});

	if (!confirmed) {
		throw new WalletRpcUserRejectedError();
	}
}

function fingerprintChallenge(challengeHex: string): string {
	return bytesToHex(sha256(hexToBytes(challengeHex))).slice(0, 32);
}
