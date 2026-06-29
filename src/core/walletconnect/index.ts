import { requestBackground } from "@/core/extension-rpc";

import type {
	WalletConnectDisconnectInput,
	WalletConnectPairInput,
	WalletConnectStatus,
} from "./types";

export function getWalletConnectStatus(): Promise<WalletConnectStatus> {
	return requestBackground<WalletConnectStatus>("walletconnect.status");
}

export function pairWalletConnectUri(input: WalletConnectPairInput): Promise<WalletConnectStatus> {
	return requestBackground<WalletConnectStatus>("walletconnect.pair", input);
}

export function disconnectWalletConnectSession(
	input: WalletConnectDisconnectInput,
): Promise<WalletConnectStatus> {
	return requestBackground<WalletConnectStatus>("walletconnect.disconnect", input);
}
