import type { KeyManagerState } from "@/core/key-manager/types";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcConfirmationHandler } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import type {
	LiquidGetIdentityPublicKeyResult,
	ParsedLiquidGetIdentityPublicKeyParams,
} from "../../../domain/identity/types";
import { parseLiquidGetIdentityPublicKeyParams } from "../../../domain/identity/validation";
import type { LiquidIdentityBackend } from "../../backends/LiquidIdentityBackend";

export type LiquidGetIdentityPublicKeyContext = {
	chain: LiquidChainRecord;
	confirm?: WalletRpcConfirmationHandler;
	identityBackend: LiquidIdentityBackend;
	keyManagerState: KeyManagerState;
};

export const getLiquidIdentityPublicKey = createWalletMethod<
	ParsedLiquidGetIdentityPublicKeyParams,
	LiquidGetIdentityPublicKeyContext,
	null,
	LiquidGetIdentityPublicKeyResult
>({
	confirmation: ({ context, params }) => ({
		data: {
			chainId: context.chain.id,
			curve: params.curve,
			identity: params.identity,
			index: params.index,
			kind: "liquid.getIdentityPublicKey",
		},
		message: "A dapp wants to read a deterministic Liquid identity public key.",
		title: "Share Liquid identity public key?",
	}),
	execute: ({ context, params }) =>
		context.identityBackend.getIdentityPublicKey({
			...params,
			keyManagerState: context.keyManagerState,
		}),
	parse: parseLiquidGetIdentityPublicKeyParams,
	review: () => null,
});
