import * as walletConnect from "@/core/walletconnect/background";
import { walletConnectRpc } from "@/core/walletconnect/model/rpc";
import type {
	WalletConnectDisconnectInput,
	WalletConnectPairInput,
} from "@/core/walletconnect/types";

import type { RequestHandlerMap } from "../transport";

export const walletConnectInternalHandlers: RequestHandlerMap = {
	[walletConnectRpc.methods.status]: () => {
		return walletConnect.getWalletConnectStatus();
	},
	[walletConnectRpc.methods.pair]: (message) => {
		return walletConnect.pairWalletConnectUri(message.data as WalletConnectPairInput);
	},
	[walletConnectRpc.methods.disconnect]: (message) => {
		return walletConnect.disconnectWalletConnectSession(
			message.data as WalletConnectDisconnectInput,
		);
	},
};
