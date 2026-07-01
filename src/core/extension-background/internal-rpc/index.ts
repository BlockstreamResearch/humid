import type {
	PortfolioSnapshot,
	ReceiveAddress,
} from "@/core/accounts/application/accounts-rpc/model/types";
import type { ChainGroup } from "@/core/chains/application/ChainGroup";
import type { ConfirmationRequest } from "@/helpers/background";

import type { ConfirmationResponder } from "../confirmations";
import type { RequestHandlerMap } from "../transport";
import { createAccountsInternalHandlers } from "./accounts";
import { createChainsInternalHandlers } from "./chains";
import { walletVaultInternalHandlers } from "./wallet-vault";
import { walletConnectInternalHandlers } from "./walletconnect";

export { syncWalletVaultAuthStore } from "./wallet-vault";

export type CreateInternalRpcHandlersInput = {
	chainGroups: readonly Pick<ChainGroup, "chains" | "id">[];
	confirmations: ConfirmationResponder;
	getPortfolio: () => Promise<PortfolioSnapshot>;
	getReceiveAddress: () => Promise<ReceiveAddress>;
};

/**
 * Builds the popup/internal handler map. This surface is never reachable from a
 * dapp: the transport dispatches injected senders to a separate registry.
 */
export function createInternalRpcHandlers({
	chainGroups,
	confirmations,
	getPortfolio,
	getReceiveAddress,
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
		...createChainsInternalHandlers(chainGroups),
		...createAccountsInternalHandlers({ getPortfolio, getReceiveAddress }),
	};
}
