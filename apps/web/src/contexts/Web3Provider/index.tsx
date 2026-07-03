import { HumidAdapter, liquidNetworks, liquidTestnet } from "@humid/appkit-injected-adapter";
import { createAppKit } from "@reown/appkit/react";
import type { PropsWithChildren } from "react";

// Injected HUMID Liquid wallet in one call: the preset adapter carries every default (connector,
// window.humid, method set, ecdsa signMessage), and the networks come straight from the package.
createAppKit({
	adapters: [new HumidAdapter()],
	networks: liquidNetworks,
	defaultNetwork: liquidTestnet,
	projectId: "41f8085dc01ff1ca42c6efcb2c12c169",
	metadata: {
		name: "HUMID Liquid Dapp",
		description: "HUMID browser extension Liquid Wallet RPC test dapp",
		url: typeof window !== "undefined" ? window.location.origin : "",
		icons: [],
	},
	enableReconnect: true,
	features: {
		analytics: false,
		email: false,
		socials: false,
	},
	themeMode: "dark",
});

export const Web3Provider = ({ children }: PropsWithChildren) => {
	return <>{children}</>;
};
