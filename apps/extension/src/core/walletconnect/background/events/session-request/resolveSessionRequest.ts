import type { WalletKitTypes } from "@reown/walletkit";

import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";
import { getWalletConnectNamespaceAdapter } from "@/core/walletconnect/namespace-registry";

import { getBackgroundOptions } from "../../state";
import type { WalletKitClient } from "../../types";
import { WalletConnectRequestError } from "./WalletConnectRequestError";

export async function resolveSessionRequest(
	walletKit: WalletKitClient,
	event: WalletKitTypes.SessionRequest,
): Promise<unknown> {
	const keyManagerState = walletVaultBackground.keyManager.getState();
	const adapter = getWalletConnectNamespaceAdapter(event.params.chainId);

	if (!adapter?.handleSessionRequest) {
		throw new WalletConnectRequestError("UNSUPPORTED_METHODS", event.params.request.method);
	}

	return adapter.handleSessionRequest(event, {
		approvedScope: resolveApprovedScope(walletKit, event.topic, adapter.namespace),
		confirm: getBackgroundOptions().confirm,
		keyManagerState,
		// Same serve-from-cache hook the injected dapp path uses: the adapter spreads it into the
		// dispatched context so WC getBalance/getUTXOs serve from the snapshot when one exists.
		readPortfolioSnapshot: getBackgroundOptions().readPortfolioSnapshot,
		updateKeyManagerState: walletVaultBackground.keyManager.updateState,
	});
}

/**
 * The methods + accounts the session granted for this namespace, read from the live WalletConnect
 * session. Undefined when the session or its namespace can't be found, so the adapter falls back
 * to its pre-enforcement behavior rather than hard-failing a legitimate request.
 */
function resolveApprovedScope(
	walletKit: WalletKitClient,
	topic: string,
	namespace: string,
): { accounts: readonly string[]; methods: readonly string[] } | undefined {
	const approved = walletKit.getActiveSessions()[topic]?.namespaces[namespace];

	if (!approved) return undefined;

	return { accounts: approved.accounts ?? [], methods: approved.methods ?? [] };
}
