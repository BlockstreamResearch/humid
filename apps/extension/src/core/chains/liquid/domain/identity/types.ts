import type { LiquidIdentityCurve, LiquidIdentitySharedKeyKdf } from "@humid/wallet-rpc";

export {
	LIQUID_IDENTITY_CURVE,
	LIQUID_IDENTITY_PUBLIC_KEY_TYPE,
	LIQUID_IDENTITY_SHARED_KEY_KDF,
	LIQUID_IDENTITY_SHARED_KEY_TYPE,
} from "@humid/wallet-rpc";
export type {
	LiquidIdentityCurve,
	LiquidIdentityPublicKeyType,
	LiquidIdentitySharedKeyKdf,
	LiquidIdentitySharedKeyType,
	LiquidGetIdentityPublicKeyParams,
	LiquidGetIdentityPublicKeyResult,
	LiquidGetIdentitySharedKeyParams,
	LiquidGetIdentitySharedKeyResult,
	LiquidSignIdentityParams,
	LiquidSignIdentityResult,
} from "@humid/wallet-rpc";

export type ParsedLiquidGetIdentityPublicKeyParams = {
	curve: LiquidIdentityCurve;
	identity: string;
	index: number;
};

export type ParsedLiquidGetIdentitySharedKeyParams = {
	curve: LiquidIdentityCurve;
	identity: string;
	index: number;
	kdf: LiquidIdentitySharedKeyKdf;
	kdfInfo: string;
	kdfSalt: string;
	theirPublicKey: string;
};

export type ParsedLiquidSignIdentityParams = {
	challenge: string;
	curve: LiquidIdentityCurve;
	identity: string;
	index: number;
};
