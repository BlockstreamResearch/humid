import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { KeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcConfirmationHandler } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import {
	type LiquidGetIdentitySharedKeyResult,
	type ParsedLiquidGetIdentitySharedKeyParams,
} from "../../../domain/identity/types";
import { parseLiquidGetIdentitySharedKeyParams } from "../../../domain/identity/validation";
import type { LiquidIdentityBackend } from "../../backends/LiquidIdentityBackend";

export type LiquidGetIdentitySharedKeyContext = {
	chain: LiquidChainRecord;
	confirm?: WalletRpcConfirmationHandler;
	identityBackend: LiquidIdentityBackend;
	keyManagerState: KeyManagerState;
};

export const getLiquidIdentitySharedKey = createWalletMethod<
	ParsedLiquidGetIdentitySharedKeyParams,
	LiquidGetIdentitySharedKeyContext,
	null,
	LiquidGetIdentitySharedKeyResult
>({
	confirmation: ({ context, params }) => ({
		data: {
			chainId: context.chain.id,
			curve: params.curve,
			identity: params.identity,
			index: params.index,
			kind: "liquid.getIdentitySharedKey",
			kdf: params.kdf,
			kdfInfo: params.kdfInfo,
			kdfSalt: params.kdfSalt,
			theirPublicKeyFingerprint: fingerprintPublicKey(params.theirPublicKey),
		},
		message: "A dapp wants to derive a Liquid identity shared key.",
		title: "Derive Liquid shared key?",
	}),
	execute: ({ context, params }) =>
		context.identityBackend.getIdentitySharedKey({
			...params,
			keyManagerState: context.keyManagerState,
		}),
	parse: parseLiquidGetIdentitySharedKeyParams,
	review: () => null,
});

function fingerprintPublicKey(publicKeyHex: string): string {
	return bytesToHex(sha256(hexToBytes(publicKeyHex))).slice(0, 32);
}
