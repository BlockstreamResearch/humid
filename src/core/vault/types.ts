export type VaultStatus = {
	hasVault: boolean;
	isUnlocked: boolean;
	createdAt?: number;
	updatedAt?: number;
};

export type VaultCreateInput = {
	passphrase: string;
	secret: string;
};

export type VaultUnlockInput = {
	passphrase: string;
};
