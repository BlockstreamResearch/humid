import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { KeyManagerState } from "@/core/key-manager/types";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
	WalletRpcUserRejectedError,
} from "@/core/wallet-rpc/errors";

import {
	type LiquidGetIdentitySharedKeyResult,
	type ParsedLiquidGetIdentitySharedKeyParams,
} from "../../../domain/identity/types";
import { parseLiquidGetIdentitySharedKeyParams } from "../../../domain/identity/validation";
import type { LiquidChainId } from "../../../domain/LiquidChain";
import type { ConfirmationPort } from "../../../ports/ConfirmationPort";
import type { LiquidIdentityBackend } from "../../../ports/LiquidIdentityBackend";

export type LiquidGetIdentitySharedKeyContext = {
	chainId: LiquidChainId;
	confirm?: ConfirmationPort;
	identityBackend: LiquidIdentityBackend;
	keyManagerState: KeyManagerState;
};

export async function getLiquidIdentitySharedKey(
	params: unknown,
	context: LiquidGetIdentitySharedKeyContext,
): Promise<LiquidGetIdentitySharedKeyResult> {
	const parsedParams = parseLiquidGetIdentitySharedKeyParams(params);

	await requireIdentitySharedKeyConfirmation(context, parsedParams);

	return context.identityBackend.getIdentitySharedKey({
		...parsedParams,
		keyManagerState: context.keyManagerState,
	});
}

async function requireIdentitySharedKeyConfirmation(
	context: LiquidGetIdentitySharedKeyContext,
	params: ParsedLiquidGetIdentitySharedKeyParams,
): Promise<void> {
	if (!context.confirm) {
		throw new WalletRpcResourceUnavailableError(
			"Identity shared key derivation requires a confirmation surface.",
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
			kdf: params.kdf,
			kdfInfo: params.kdfInfo,
			kdfSalt: params.kdfSalt,
			theirPublicKeyFingerprint: fingerprintPublicKey(params.theirPublicKey),
		},
		message: "A dapp wants to derive a Liquid identity shared key.",
		title: "Derive Liquid shared key?",
	});

	if (!confirmed) {
		throw new WalletRpcUserRejectedError();
	}
}

function fingerprintPublicKey(publicKeyHex: string): string {
	return bytesToHex(sha256(hexToBytes(publicKeyHex))).slice(0, 32);
}
