export const accountsRpc = {
	methods: {
		createAccount: "accounts.createAccount",
		estimateMaxSend: "accounts.estimateMaxSend",
		getActivity: "accounts.getActivity",
		getPortfolio: "accounts.getPortfolio",
		getReceiveAddress: "accounts.getReceiveAddress",
		getState: "accounts.getState",
		importAccount: "accounts.importAccount",
		inspectTransfer: "accounts.inspectTransfer",
		refreshPortfolio: "accounts.refreshPortfolio",
		removeAccount: "accounts.removeAccount",
		removeWallet: "accounts.removeWallet",
		rename: "accounts.rename",
		revealRecoveryPhrase: "accounts.revealRecoveryPhrase",
		sendTransfer: "accounts.sendTransfer",
		setSelected: "accounts.setSelected",
	},
} as const;
