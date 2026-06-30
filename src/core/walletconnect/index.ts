import { requestBackground } from "@/core/extension-rpc";

import { walletConnectRpc } from "./model/rpc";
import type {
	WalletConnectDisconnectInput,
	WalletConnectPairInput,
	WalletConnectStatus,
} from "./types";

export function getWalletConnectStatus(): Promise<WalletConnectStatus> {
	return requestBackground<WalletConnectStatus>(walletConnectRpc.methods.status);
}

export function pairWalletConnectUri(input: WalletConnectPairInput): Promise<WalletConnectStatus> {
	return requestBackground<WalletConnectStatus>(walletConnectRpc.methods.pair, input);
}

export function disconnectWalletConnectSession(
	input: WalletConnectDisconnectInput,
): Promise<WalletConnectStatus> {
	return requestBackground<WalletConnectStatus>(walletConnectRpc.methods.disconnect, input);
}
