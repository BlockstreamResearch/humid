export type WalletVaultStatus = {
	accountCount?: number;
	hasVault: boolean;
	isUnlocked: boolean;
	keyringCount?: number;
	createdAt?: number;
	updatedAt?: number;
};

export type WalletVaultCreateInput = {
	passphrase: string;
	seedMaterial: string;
};

export type WalletVaultUnlockInput = {
	passphrase: string;
};
