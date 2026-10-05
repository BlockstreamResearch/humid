import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { KeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import {
	type LiquidSignIdentityResult,
	type ParsedLiquidSignIdentityParams,
} from "../../../domain/identity/types";
import { parseLiquidSignIdentityParams } from "../../../domain/identity/validation";
import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";
import type { LiquidIdentityBackend } from "../../backends/LiquidIdentityBackend";

export type LiquidSignIdentityContext = WalletRpcBaseContext & {
	chain: LiquidChainRecord;
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
		confirmLabel: "Sign",
		data: {
			chainId: context.chain.id,
			challenge: params.challenge,
			challengeFingerprint: fingerprintChallenge(params.challenge),
			curve: params.curve,
			identity: params.identity,
			index: params.index,
			kind: "liquid.signIdentity",
		},
		message: [
			"A dapp wants to sign an identity challenge to authenticate or prove control of this identity.",
			`Network: ${context.chain.id}\nIdentity: ${params.identity}\nIdentity index: ${params.index}\nCurve: ${params.curve}`,
			`Challenge (hex): ${params.challenge}`,
			readableChallenge(params.challenge),
			`Challenge fingerprint (SHA-256 prefix): ${fingerprintChallenge(params.challenge)}`,
		]
			.filter(Boolean)
			.join("\n\n"),
		title: "Sign Liquid identity challenge?",
	}),
	execute: ({ context, params }) =>
		context.identityBackend.signIdentity({
			...params,
			keyManagerState: context.keyManagerState,
		}),
	id: LIQUID_WALLET_RPC_METHODS.SIGN_IDENTITY,
	parse: parseLiquidSignIdentityParams,
	review: () => null,
});

function fingerprintChallenge(challengeHex: string): string {
	return bytesToHex(sha256(hexToBytes(challengeHex))).slice(0, 32);
}

function readableChallenge(challenge: string): string {
	try {
		const text = new TextDecoder("utf-8", { fatal: true }).decode(hexToBytes(challenge));
		for (const character of text) {
			const code = character.charCodeAt(0);
			if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) return "";
		}
		return `Challenge (UTF-8):\n${text}`;
	} catch {
		return "";
	}
}
