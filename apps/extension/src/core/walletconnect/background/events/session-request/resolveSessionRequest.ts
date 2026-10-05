import type { WalletKitTypes } from "@reown/walletkit";

import { dappAuthorizationErrors } from "@/core/extension-background/dapp-authorization/errors";
import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";
import { WalletRpcUnauthorizedError } from "@/core/wallet-rpc/errors";
import { getWalletConnectNamespaceAdapter } from "@/core/walletconnect/namespace-registry";

import { getBackgroundOptions } from "../../state";
import type { WalletKitClient } from "../../types";
import { WalletConnectRequestError } from "./WalletConnectRequestError";

export async function resolveSessionRequest(
	walletKit: WalletKitClient,
	event: WalletKitTypes.SessionRequest,
): Promise<unknown> {
	const options = getBackgroundOptions();

	await options.waitForUnlock?.();

	if (!(await walletVaultBackground.getStatus()).isUnlocked) {
		throw dappAuthorizationErrors.walletLocked(
			"Wallet is locked. Open Humid and unlock it, then retry.",
		);
	}

	const adapter = getWalletConnectNamespaceAdapter(event.params.chainId);

	if (!adapter?.handleSessionRequest) {
		throw new WalletConnectRequestError("UNSUPPORTED_METHODS", event.params.request.method);
	}

	const peer = walletKit.getActiveSessions()[event.topic]?.peer.metadata;

	const approvedScope = resolveApprovedScope(walletKit, event, adapter.namespace);
	const keyManagerState = walletVaultBackground.keyManager.getState();

	return adapter.handleSessionRequest(event, {
		approvedScope,
		confirm: options.confirm,
		keyManagerState,
		readPortfolioSnapshot: options.readPortfolioSnapshot,
		requester: peer ? { name: peer.name, origin: peer.url } : undefined,
		updateKeyManagerState: walletVaultBackground.keyManager.updateState,
	});
}

function resolveApprovedScope(
	walletKit: WalletKitClient,
	event: WalletKitTypes.SessionRequest,
	namespace: string,
): { accounts: readonly string[]; methods: readonly string[] } {
	const approved = walletKit.getActiveSessions()[event.topic]?.namespaces[namespace];
	const { chainId, request } = event.params;

	if (
		!approved ||
		!approved.methods.includes(request.method) ||
		!(
			approved.chains?.includes(chainId) ||
			approved.accounts.some((account) => account.startsWith(`${chainId}:`))
		)
	) {
		throw new WalletRpcUnauthorizedError(
			request.method,
			"The WalletConnect session does not authorize this method and chain.",
		);
	}

	return { accounts: approved.accounts, methods: approved.methods };
}
