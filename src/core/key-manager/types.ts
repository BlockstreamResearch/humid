export type KeyringMaterialEncoding = "utf8";

export type KeyringMaterialKind = "seed";

export type KeyringMaterial = {
	encoding: KeyringMaterialEncoding;
	kind: KeyringMaterialKind;
	value: string;
};

export type KeyringMetadata = Record<string, unknown>;

export type KeyringRecord = {
	accounts: string[];
	createdAt: number;
	id: string;
	material: KeyringMaterial;
	metadata?: KeyringMetadata;
	name: string;
	type: string;
	updatedAt: number;
};

export type WalletAccountRecord = {
	address: string;
	chainId: string;
	createdAt: number;
	id: string;
	keyringId: string;
	metadata?: Record<string, unknown>;
	name?: string;
	namespace: string;
	updatedAt: number;
};

export type KeyManagerState = {
	accounts: WalletAccountRecord[];
	createdAt: number;
	keyrings: KeyringRecord[];
	updatedAt: number;
	version: 1;
};

export type CreateLocalRootKeyManagerStateInput = {
	createdAt?: number;
	keyringId?: string;
	name?: string;
	seedMaterial: string;
	source?: "generated" | "imported" | "legacy";
};
