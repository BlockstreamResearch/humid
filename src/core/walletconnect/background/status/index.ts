import { getRegisteredWalletConnectNamespaces } from "../../capabilities";
import type { WalletConnectStatus } from "../../types";
import { getWalletConnectProjectId } from "../project";
import { getLastError, getRelayStatus, getWalletKitClientState } from "../state";
import {
	getPendingProposalSummaries,
	getPendingRequestSummaries,
	getSessionSummaries,
} from "./summaries";

export function getWalletConnectStatus(): WalletConnectStatus {
	const walletKit = getWalletKitClientState();

	return {
		isConfigured: Boolean(getWalletConnectProjectId()),
		isInitialized: Boolean(walletKit),
		lastError: getLastError(),
		pendingProposals: getPendingProposalSummaries(walletKit),
		pendingRequests: getPendingRequestSummaries(walletKit),
		relayStatus: getRelayStatus(),
		sessions: getSessionSummaries(walletKit),
		supportedNamespaces: getRegisteredWalletConnectNamespaces(),
	};
}
