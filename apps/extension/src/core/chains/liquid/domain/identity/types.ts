export const LIQUID_IDENTITY_CURVE = "nist256p1";

export const LIQUID_IDENTITY_PUBLIC_KEY_TYPE = "slip-0013";
export const LIQUID_IDENTITY_SHARED_KEY_KDF = "hkdf-sha256";
export const LIQUID_IDENTITY_SHARED_KEY_TYPE = "slip-0017";

export type LiquidIdentityCurve = typeof LIQUID_IDENTITY_CURVE;

export type LiquidIdentityPublicKeyType = typeof LIQUID_IDENTITY_PUBLIC_KEY_TYPE;
export type LiquidIdentitySharedKeyKdf = typeof LIQUID_IDENTITY_SHARED_KEY_KDF;
export type LiquidIdentitySharedKeyType = typeof LIQUID_IDENTITY_SHARED_KEY_TYPE;

export type LiquidGetIdentityPublicKeyParams = {
	curve: LiquidIdentityCurve;
	identity: string;
	index?: number;
};

export type ParsedLiquidGetIdentityPublicKeyParams = {
	curve: LiquidIdentityCurve;
	identity: string;
	index: number;
};

export type LiquidGetIdentityPublicKeyResult = {
	curve: LiquidIdentityCurve;
	identity: string;
	index: number;
	publicKey: string;
	type: LiquidIdentityPublicKeyType;
};

export type LiquidGetIdentitySharedKeyParams = {
	curve: LiquidIdentityCurve;
	identity: string;
	index?: number;
	kdf: LiquidIdentitySharedKeyKdf;
	kdfInfo: string;
	kdfSalt: string;
	theirPublicKey: string;
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

export type LiquidGetIdentitySharedKeyResult = {
	curve: LiquidIdentityCurve;
	identity: string;
	index: number;
	kdf: LiquidIdentitySharedKeyKdf;
	publicKey: string;
	sharedKey: string;
	type: LiquidIdentitySharedKeyType;
};

export type LiquidSignIdentityParams = {
	challenge: string;
	curve: LiquidIdentityCurve;
	identity: string;
	index?: number;
};

export type ParsedLiquidSignIdentityParams = {
	challenge: string;
	curve: LiquidIdentityCurve;
	identity: string;
	index: number;
};

export type LiquidSignIdentityResult = {
	curve: LiquidIdentityCurve;
	identity: string;
	index: number;
	publicKey: string;
	signature: string;
	type: LiquidIdentityPublicKeyType;
};
