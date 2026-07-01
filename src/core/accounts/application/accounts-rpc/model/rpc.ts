export const accountsRpc = {
	methods: {
		getPortfolio: "accounts.getPortfolio",
		getReceiveAddress: "accounts.getReceiveAddress",
		getState: "accounts.getState",
		rename: "accounts.rename",
		revealRecoveryPhrase: "accounts.revealRecoveryPhrase",
		setSelected: "accounts.setSelected",
	},
} as const;
