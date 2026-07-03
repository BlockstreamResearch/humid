import { SECURE_VAULT_CRYPTO } from "./crypto";

export const SECURE_VAULT_VERSION = 2;
export const SECURE_VAULT_META_STORAGE_KEY = "humid:vault:v2:meta";
export const SECURE_VAULT_ITEM_STORAGE_PREFIX = "humid:vault:v2:item:";
export const SECURE_VAULT_ADDITIONAL_DATA = "humid:vault:v2";
export const LEGACY_SECURE_VAULT_STORAGE_KEYS = ["humid:vault:v1"] as const;

export const SECURE_VAULT_KDF = {
	iterations: 600_000,
	saltBytes: 32,
} as const;

export const SECURE_VAULT_AES = {
	ivBytes: 12,
} as const;

export type SecureVaultMetaRecord = {
	algorithm: typeof SECURE_VAULT_CRYPTO.algorithm;
	createdAt: number;
	kdf: {
		hash: typeof SECURE_VAULT_CRYPTO.kdfHash;
		iterations: number;
		name: "PBKDF2";
		salt: string;
	};
	updatedAt: number;
	version: typeof SECURE_VAULT_VERSION;
	wrappedDataKey: {
		algorithm: typeof SECURE_VAULT_CRYPTO.algorithm;
		ciphertext: string;
		iv: string;
	};
};

export type SecureVaultItemRecord = {
	algorithm: typeof SECURE_VAULT_CRYPTO.algorithm;
	ciphertext: string;
	createdAt: number;
	iv: string;
	updatedAt: number;
	version: typeof SECURE_VAULT_VERSION;
};

export function isSecureVaultMetaRecord(value: unknown): value is SecureVaultMetaRecord {
	if (typeof value !== "object" || value === null) return false;

	const record = value as Partial<SecureVaultMetaRecord>;

	return (
		record.version === SECURE_VAULT_VERSION &&
		record.algorithm === SECURE_VAULT_CRYPTO.algorithm &&
		typeof record.createdAt === "number" &&
		typeof record.updatedAt === "number" &&
		typeof record.kdf === "object" &&
		record.kdf !== null &&
		record.kdf.name === "PBKDF2" &&
		record.kdf.hash === SECURE_VAULT_CRYPTO.kdfHash &&
		typeof record.kdf.iterations === "number" &&
		typeof record.kdf.salt === "string" &&
		typeof record.wrappedDataKey === "object" &&
		record.wrappedDataKey !== null &&
		record.wrappedDataKey.algorithm === SECURE_VAULT_CRYPTO.algorithm &&
		typeof record.wrappedDataKey.iv === "string" &&
		typeof record.wrappedDataKey.ciphertext === "string"
	);
}

export function isSecureVaultItemRecord(value: unknown): value is SecureVaultItemRecord {
	if (typeof value !== "object" || value === null) return false;

	const record = value as Partial<SecureVaultItemRecord>;

	return (
		record.version === SECURE_VAULT_VERSION &&
		record.algorithm === SECURE_VAULT_CRYPTO.algorithm &&
		typeof record.ciphertext === "string" &&
		typeof record.iv === "string" &&
		typeof record.createdAt === "number" &&
		typeof record.updatedAt === "number"
	);
}
