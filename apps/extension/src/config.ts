export const config = {
	apiUrl: "http://localhost:3000",
	walletConnect: {
		metadata: {
			description: "Humid browser extension wallet",
			icons: [],
			name: "Humid",
			url: "https://humid.local",
		},
		projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() || undefined,
		relayUrl: import.meta.env.VITE_WALLETCONNECT_RELAY_URL?.trim() || undefined,
		storagePrefix: "humid-walletconnect",
	},
} as const;
