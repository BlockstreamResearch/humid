import { WalletKit } from "@reown/walletkit";
import { Core } from "@walletconnect/core";

import { config } from "@/config";

import { getWalletConnectProjectId, MISSING_PROJECT_ID_ERROR } from "../project";
import type { WalletKitClient } from "../types";

export async function createWalletKitClient(): Promise<WalletKitClient> {
	const projectId = getWalletConnectProjectId();

	if (!projectId) {
		throw new Error(MISSING_PROJECT_ID_ERROR);
	}

	const core = new Core({
		customStoragePrefix: config.walletConnect.storagePrefix,
		projectId,
		...(config.walletConnect.relayUrl ? { relayUrl: config.walletConnect.relayUrl } : {}),
	});

	return WalletKit.init({
		core,
		metadata: {
			...config.walletConnect.metadata,
			icons: [...config.walletConnect.metadata.icons],
		},
	});
}
