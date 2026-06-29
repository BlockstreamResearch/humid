import { bindWalletKitListeners } from "../events";
import {
	getWalletKitClientState,
	getWalletKitPromiseState,
	setWalletKitClientState,
	setWalletKitPromiseState,
} from "../state";
import type { WalletKitClient } from "../types";
import { createWalletKitClient } from "./create";

export async function getWalletKitClient(): Promise<WalletKitClient> {
	const walletKitClient = getWalletKitClientState();
	if (walletKitClient) return walletKitClient;

	let walletKitPromise = getWalletKitPromiseState();

	if (!walletKitPromise) {
		walletKitPromise = createWalletKitClient()
			.then((client) => {
				setWalletKitClientState(client);
				bindWalletKitListeners(client);

				return client;
			})
			.catch((error) => {
				setWalletKitPromiseState(null);
				throw error;
			});

		setWalletKitPromiseState(walletKitPromise);
	}

	return walletKitPromise;
}
