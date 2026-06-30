import type { ConfirmationRequest } from "@/helpers/background";

import type { ConfirmationResponder } from "../confirmations";
import type { RequestHandlerMap } from "../transport";
import { walletVaultInternalHandlers } from "./wallet-vault";
import { walletConnectInternalHandlers } from "./walletconnect";

export { syncWalletVaultAuthStore } from "./wallet-vault";

export type CreateInternalRpcHandlersInput = {
	confirmations: ConfirmationResponder;
};

/**
 * Builds the popup/internal handler map. This surface is never reachable from a
 * dapp: the transport dispatches injected senders to a separate registry.
 */
export function createInternalRpcHandlers({
	confirmations,
}: CreateInternalRpcHandlersInput): RequestHandlerMap {
	return {
		ping: (message) => {
			return {
				message: "pong",
				request: message.data ?? null,
			};
		},
		confirm: async (message) => {
			const data = message.data as Partial<ConfirmationRequest> | undefined;

			return confirmations.waitForConfirmationResponse(
				data?.title ?? "Confirm action?",
				data?.message,
				data?.data,
			);
		},
		...walletVaultInternalHandlers,
		...walletConnectInternalHandlers,
	};
}
