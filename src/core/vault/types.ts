export type VaultStatus = {
	accountCount?: number;
	hasVault: boolean;
	isUnlocked: boolean;
	keyringCount?: number;
	createdAt?: number;
	updatedAt?: number;
};

export type VaultCreateInput = {
	passphrase: string;
	seedMaterial: string;
};

export type VaultUnlockInput = {
	passphrase: string;
};
