import type { WalletKitTypes } from "@reown/walletkit";

import { getErrorMessage } from "../../errors";
import { setLastError } from "../../state";
import type { WalletKitClient } from "../../types";
import { resolveSessionRequest } from "./resolveSessionRequest";
import { toJsonRpcError } from "./toJsonRpcError";

export async function handleSessionRequest(
	walletKit: WalletKitClient,
	event: WalletKitTypes.SessionRequest,
): Promise<void> {
	try {
		const result = await resolveSessionRequest(walletKit, event);

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
				// WalletConnect types narrow error.data to string, but JSON-RPC permits structured data.
				error: toJsonRpcError(error) as { code: number; data?: string; message: string },
				id: event.id,
				jsonrpc: "2.0",
			},
			topic: event.topic,
		});
	}
}
