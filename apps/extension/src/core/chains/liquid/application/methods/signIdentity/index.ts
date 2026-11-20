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
import {
	SIGN_IDENTITY_CONFIRMATION_KIND,
	type SignIdentityConfirmationData,
} from "./SignIdentityConfirmation";

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
			challenge: params.challenge,
			fingerprint: bytesToHex(sha256(hexToBytes(params.challenge))).slice(0, 16),
			identity: params.identity,
			index: params.index,
			kind: SIGN_IDENTITY_CONFIRMATION_KIND,
			network: context.chain.name,
			text: readableText(params.challenge),
		} satisfies SignIdentityConfirmationData,
		title: "Prove an identity?",
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

function readableText(challenge: string): string | undefined {
	try {
		const text = new TextDecoder("utf-8", { fatal: true }).decode(hexToBytes(challenge));
		for (const character of text) {
			const code = character.charCodeAt(0);
			if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) return undefined;
		}
		return text;
	} catch {
		return undefined;
	}
}
