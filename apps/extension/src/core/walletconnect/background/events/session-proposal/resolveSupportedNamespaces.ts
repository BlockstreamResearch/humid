import type { WalletKitTypes } from "@reown/walletkit";

import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";
import { getWalletConnectNamespaceAdapter } from "@/core/walletconnect/namespace-registry";
import type { WalletConnectSupportedNamespaces } from "@/core/walletconnect/types";

import { getBackgroundOptions } from "../../state";
import { getRequestedNamespaces } from "./getRequestedNamespaces";

export async function resolveSupportedNamespaces(
	proposal: WalletKitTypes.SessionProposal["params"],
): Promise<WalletConnectSupportedNamespaces> {
	const keyManagerState = walletVaultBackground.keyManager.getState();
	const requestedNamespaces = getRequestedNamespaces(proposal);
	const supportedNamespaceEntries = await Promise.all(
		requestedNamespaces.map(async (namespace) => {
			const adapter = getWalletConnectNamespaceAdapter(namespace);
			if (!adapter) return null;

			const supportedNamespace = await adapter.getSupportedNamespace(proposal, {
				confirm: getBackgroundOptions().confirm,
				keyManagerState,
				updateKeyManagerState: walletVaultBackground.keyManager.updateState,
			});
			if (!supportedNamespace) return null;

			return [namespace, supportedNamespace] as const;
		}),
	);

	return Object.fromEntries(supportedNamespaceEntries.filter((entry) => entry !== null));
}
