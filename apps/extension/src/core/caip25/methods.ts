export const caip25Rpc = {
	methods: {
		addChain: "wallet_addChain",
		createSession: "wallet_createSession",
		getSession: "wallet_getSession",
		invokeMethod: "wallet_invokeMethod",
		revokeSession: "wallet_revokeSession",
		switchChain: "wallet_switchChain",
	},
} as const;
