import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { KeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import {
	type LiquidGetIdentitySharedKeyResult,
	type ParsedLiquidGetIdentitySharedKeyParams,
} from "../../../domain/identity/types";
import { parseLiquidGetIdentitySharedKeyParams } from "../../../domain/identity/validation";
import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";
import type { LiquidIdentityBackend } from "../../backends/LiquidIdentityBackend";

export type LiquidGetIdentitySharedKeyContext = WalletRpcBaseContext & {
	chain: LiquidChainRecord;
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
	id: LIQUID_WALLET_RPC_METHODS.GET_IDENTITY_SHARED_KEY,
	parse: parseLiquidGetIdentitySharedKeyParams,
	review: () => null,
});

function fingerprintPublicKey(publicKeyHex: string): string {
	return bytesToHex(sha256(hexToBytes(publicKeyHex))).slice(0, 32);
}
