import type {
	WalletConnectProposalSummary,
	WalletConnectRequestSummary,
	WalletConnectSessionSummary,
} from "../../types";
import type { WalletKitClient } from "../types";

export function getSessionSummaries(
	walletKit: WalletKitClient | null,
): WalletConnectSessionSummary[] {
	if (!walletKit) return [];

	return Object.values(walletKit.getActiveSessions()).map((session) => ({
		expiry: session.expiry,
		namespaces: session.namespaces,
		peer: session.peer.metadata,
		topic: session.topic,
	}));
}

export function getPendingProposalSummaries(
	walletKit: WalletKitClient | null,
): WalletConnectProposalSummary[] {
	if (!walletKit) return [];

	return Object.values(walletKit.getPendingSessionProposals()).map((proposal) => ({
		expiryTimestamp: proposal.expiryTimestamp,
		id: proposal.id,
		optionalNamespaces: Object.keys(proposal.optionalNamespaces ?? {}),
		peer: proposal.proposer.metadata,
		requiredNamespaces: Object.keys(proposal.requiredNamespaces ?? {}),
	}));
}

export function getPendingRequestSummaries(
	walletKit: WalletKitClient | null,
): WalletConnectRequestSummary[] {
	if (!walletKit) return [];

	return walletKit.getPendingSessionRequests().map((request) => ({
		chainId: request.params.chainId,
		id: request.id,
		method: request.params.request.method,
		topic: request.topic,
	}));
}
