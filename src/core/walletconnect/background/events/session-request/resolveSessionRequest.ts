import type { WalletKitTypes } from "@reown/walletkit";

import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";
import { getWalletConnectNamespaceAdapter } from "@/core/walletconnect/namespace-registry";

import { getBackgroundOptions } from "../../state";
import { WalletConnectRequestError } from "./WalletConnectRequestError";

export async function resolveSessionRequest(
	event: WalletKitTypes.SessionRequest,
): Promise<unknown> {
	const keyManagerState = walletVaultBackground.keyManager.getState();
	const adapter = getWalletConnectNamespaceAdapter(event.params.chainId);

	if (!adapter?.handleSessionRequest) {
		throw new WalletConnectRequestError("UNSUPPORTED_METHODS", event.params.request.method);
	}

	return adapter.handleSessionRequest(event, {
		confirm: getBackgroundOptions().confirm,
		keyManagerState,
		updateKeyManagerState: walletVaultBackground.keyManager.updateState,
	});
}
