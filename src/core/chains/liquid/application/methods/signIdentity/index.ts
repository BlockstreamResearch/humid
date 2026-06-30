import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { KeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcConfirmationHandler } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import {
	type LiquidSignIdentityResult,
	type ParsedLiquidSignIdentityParams,
} from "../../../domain/identity/types";
import { parseLiquidSignIdentityParams } from "../../../domain/identity/validation";
import type { LiquidIdentityBackend } from "../../backends/LiquidIdentityBackend";

export type LiquidSignIdentityContext = {
	chain: LiquidChainRecord;
	confirm?: WalletRpcConfirmationHandler;
	identityBackend: LiquidIdentityBackend;
	keyManagerState: KeyManagerState;
};

export const signLiquidIdentity = createWalletMethod<
	ParsedLiquidSignIdentityParams,
	LiquidSignIdentityContext,
	null,
	LiquidSignIdentityResult
>({
	confirmation: ({ context, params }) => ({
		data: {
			chainId: context.chain.id,
			challengeFingerprint: fingerprintChallenge(params.challenge),
			curve: params.curve,
			identity: params.identity,
			index: params.index,
			kind: "liquid.signIdentity",
		},
		message: "A dapp wants to sign an identity challenge.",
		title: "Sign Liquid identity challenge?",
	}),
	execute: ({ context, params }) =>
		context.identityBackend.signIdentity({
			...params,
			keyManagerState: context.keyManagerState,
		}),
	parse: parseLiquidSignIdentityParams,
	review: () => null,
});

function fingerprintChallenge(challengeHex: string): string {
	return bytesToHex(sha256(hexToBytes(challengeHex))).slice(0, 32);
}
