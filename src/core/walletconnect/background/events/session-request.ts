import type { WalletKitTypes } from "@reown/walletkit";

import { handleWalletConnectSessionRequest } from "../../capabilities";
import { getErrorMessage } from "../errors";
import { setLastError } from "../state";
import type { WalletKitClient } from "../types";
import { toJsonRpcError } from "./json-rpc-error";

export async function handleSessionRequest(
	walletKit: WalletKitClient,
	event: WalletKitTypes.SessionRequest,
): Promise<void> {
	try {
		const result = await handleWalletConnectSessionRequest(event);

		await walletKit.respondSessionRequest({
			response: {
				id: event.id,
				jsonrpc: "2.0",
				result,
			},
			topic: event.topic,
		});
		setLastError(null);
	} catch (error) {
		setLastError(getErrorMessage(error));
		await walletKit.respondSessionRequest({
			response: {
				error: toJsonRpcError(error),
				id: event.id,
				jsonrpc: "2.0",
			},
			topic: event.topic,
		});
	}
}
