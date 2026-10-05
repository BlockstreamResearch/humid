import type { WalletKitTypes } from "@reown/walletkit";

import { dappAuthorizationErrors } from "@/core/extension-background/dapp-authorization/errors";
import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";
import { getWalletConnectNamespaceAdapter } from "@/core/walletconnect/namespace-registry";
import type { WalletConnectSupportedNamespaces } from "@/core/walletconnect/types";

import { getBackgroundOptions } from "../../state";
import { getRequestedNamespaces } from "./getRequestedNamespaces";

export async function resolveSupportedNamespaces(
	proposal: WalletKitTypes.SessionProposal["params"],
): Promise<WalletConnectSupportedNamespaces> {
	const options = getBackgroundOptions();

	await options.waitForUnlock?.();

	if (!(await walletVaultBackground.getStatus()).isUnlocked) {
		throw dappAuthorizationErrors.walletLocked(
			"Wallet is locked. Open Humid and unlock it, then retry.",
		);
	}

	const requestedNamespaces = getRequestedNamespaces(proposal);
	const keyManagerState = walletVaultBackground.keyManager.getState();
	const supportedNamespaceEntries = await Promise.all(
		requestedNamespaces.map(async (namespace) => {
			const adapter = getWalletConnectNamespaceAdapter(namespace);
			if (!adapter) return null;

			const supportedNamespace = await adapter.getSupportedNamespace(proposal, {
				confirm: options.confirm,
				keyManagerState,
				updateKeyManagerState: walletVaultBackground.keyManager.updateState,
			});
			if (!supportedNamespace) return null;

			return [namespace, supportedNamespace] as const;
		}),
	);

	return Object.fromEntries(supportedNamespaceEntries.filter((entry) => entry !== null));
}
