export const walletVaultRpc = {
	methods: {
		create: "walletVault.create",
		getAutoLock: "walletVault.getAutoLock",
		lock: "walletVault.lock",
		reset: "walletVault.reset",
		setAutoLock: "walletVault.setAutoLock",
		unlock: "walletVault.unlock",
	},
} as const;
