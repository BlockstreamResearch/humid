import type {
	ActivityPage,
	GetActivityInput,
	PortfolioSnapshot,
	ReceiveAddress,
	SendTransferInput,
	SendTransferResult,
	TransferReview,
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
	getActivity: (input: GetActivityInput) => Promise<ActivityPage>;
	getPortfolio: () => Promise<PortfolioSnapshot>;
	getReceiveAddress: () => Promise<ReceiveAddress>;
	inspectTransfer: (input: SendTransferInput) => Promise<TransferReview>;
	purgeAccountPortfolio: (accountGroupId: string) => Promise<void>;
	refreshPortfolio: () => Promise<PortfolioSnapshot>;
	sendTransfer: (input: SendTransferInput) => Promise<SendTransferResult>;
};

/**
 * Builds the popup/internal handler map. This surface is never reachable from a
 * dapp: the transport dispatches injected senders to a separate registry.
 */
export function createInternalRpcHandlers({
	chainGroups,
	confirmations,
	getActivity,
	getPortfolio,
	getReceiveAddress,
	inspectTransfer,
	purgeAccountPortfolio,
	refreshPortfolio,
	sendTransfer,
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

			const decision = await confirmations.confirm({
				title: data?.title ?? "Confirm action?",
				message: data?.message,
				data: data?.data,
			});

			return decision.approved;
		},
		...walletVaultInternalHandlers,
		...walletConnectInternalHandlers,
		...createChainsInternalHandlers(chainGroups),
		...createAccountsInternalHandlers({
			getActivity,
			getPortfolio,
			getReceiveAddress,
			inspectTransfer,
			purgeAccountPortfolio,
			refreshPortfolio,
			sendTransfer,
		}),
	};
}
