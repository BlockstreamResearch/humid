import type { KeyManagerState } from "@/core/key-manager/types";

import type {
	LiquidGetIdentityPublicKeyResult,
	LiquidGetIdentitySharedKeyResult,
	LiquidSignIdentityResult,
	ParsedLiquidGetIdentityPublicKeyParams,
	ParsedLiquidGetIdentitySharedKeyParams,
	ParsedLiquidSignIdentityParams,
} from "../../domain/identity/types";

export type GetLiquidIdentityPublicKeyInput = ParsedLiquidGetIdentityPublicKeyParams & {
	keyManagerState: KeyManagerState;
};

export type GetLiquidIdentitySharedKeyInput = ParsedLiquidGetIdentitySharedKeyParams & {
	keyManagerState: KeyManagerState;
};

export type SignLiquidIdentityInput = ParsedLiquidSignIdentityParams & {
	keyManagerState: KeyManagerState;
};

export type LiquidIdentityBackend = {
	getIdentityPublicKey: (
		input: GetLiquidIdentityPublicKeyInput,
	) => Promise<LiquidGetIdentityPublicKeyResult>;
	getIdentitySharedKey: (
		input: GetLiquidIdentitySharedKeyInput,
	) => Promise<LiquidGetIdentitySharedKeyResult>;
	signIdentity: (input: SignLiquidIdentityInput) => Promise<LiquidSignIdentityResult>;
};
