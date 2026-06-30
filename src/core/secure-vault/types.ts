export type SecureVaultStatus = {
	createdAt?: number;
	hasVault: boolean;
	isUnlocked: boolean;
	updatedAt?: number;
};

export type SecureVaultCreateInput = {
	passphrase: string;
};

export type SecureVaultUnlockInput = {
	passphrase: string;
};

export type SecureVaultStorage = {
	deleteItem: (key: string) => Promise<void>;
	getItem: (key: string) => Promise<string | null>;
	setItem: (key: string, value: string) => Promise<void>;
	updateItem: (key: string, update: (value: string | null) => string) => Promise<string>;
};
