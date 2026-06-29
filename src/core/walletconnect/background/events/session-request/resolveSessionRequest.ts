import type { WalletKitTypes } from "@reown/walletkit";

import { getUnlockedKeyManagerState } from "@/core/vault/background";
import { getWalletConnectNamespaceAdapter } from "@/core/walletconnect/namespace-registry";

import { getBackgroundOptions } from "../../state";
import { WalletConnectRequestError } from "./WalletConnectRequestError";

export async function resolveSessionRequest(
	event: WalletKitTypes.SessionRequest,
): Promise<unknown> {
	const keyManagerState = getUnlockedKeyManagerState();
	const adapter = getWalletConnectNamespaceAdapter(event.params.chainId);

	if (!adapter?.handleSessionRequest) {
		throw new WalletConnectRequestError("UNSUPPORTED_METHODS", event.params.request.method);
	}

	return adapter.handleSessionRequest(event, {
		confirm: getBackgroundOptions().confirm,
		keyManagerState,
	});
}
