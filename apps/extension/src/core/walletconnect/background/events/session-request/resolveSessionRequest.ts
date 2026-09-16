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
		readPortfolioSnapshot: getBackgroundOptions().readPortfolioSnapshot,
		updateKeyManagerState: walletVaultBackground.keyManager.updateState,
	});
}

function resolveApprovedScope(
	walletKit: WalletKitClient,
	topic: string,
	namespace: string,
): { accounts: readonly string[]; methods: readonly string[] } | undefined {
	const approved = walletKit.getActiveSessions()[topic]?.namespaces[namespace];

	if (!approved) return undefined;

	return { accounts: approved.accounts ?? [], methods: approved.methods ?? [] };
}
