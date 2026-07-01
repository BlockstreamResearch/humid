export const accountsRpc = {
	methods: {
		createAccount: "accounts.createAccount",
		getPortfolio: "accounts.getPortfolio",
		getReceiveAddress: "accounts.getReceiveAddress",
		getState: "accounts.getState",
		importAccount: "accounts.importAccount",
		removeAccount: "accounts.removeAccount",
		rename: "accounts.rename",
		revealRecoveryPhrase: "accounts.revealRecoveryPhrase",
		setSelected: "accounts.setSelected",
	},
} as const;
