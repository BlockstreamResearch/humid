import type { WalletKitTypes } from "@reown/walletkit";

import type { PortfolioData } from "@/core/accounts/application/accounts-rpc/model/types";
import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";

export type WalletConnectRelayStatus = "unknown" | "connected" | "disconnected";

export type WalletConnectReadPortfolioSnapshot = (
	accountGroupId: string,
	chainId: string,
) => Promise<{ data: PortfolioData } | null>;

export type WalletConnectPeerMetadata = {
	description?: string;
	icons?: string[];
	name?: string;
	url?: string;
};

export type WalletConnectSupportedNamespace = {
	chains: string[];
	methods: string[];
	events: string[];
	accounts: string[];
};

export type WalletConnectSupportedNamespaces = Record<string, WalletConnectSupportedNamespace>;

export type WalletConnectAdapterContext = {
	approvedScope?: { accounts: readonly string[]; methods: readonly string[] };
	confirm?: WalletConnectConfirmationHandler;
	keyManagerState: KeyManagerState;
	readPortfolioSnapshot?: WalletConnectReadPortfolioSnapshot;
	updateKeyManagerState?: UpdateKeyManagerState;
};

export type WalletConnectNamespaceAdapter = {
	namespace: string;
	getSupportedNamespace: (
		proposal: WalletKitTypes.SessionProposal["params"],
		context: WalletConnectAdapterContext,
	) => Promise<WalletConnectSupportedNamespace | null> | WalletConnectSupportedNamespace | null;
	handleSessionRequest?: (
		event: WalletKitTypes.SessionRequest,
		context: WalletConnectAdapterContext,
	) => Promise<unknown> | unknown;
};

export type WalletConnectPairInput = {
	uri: string;
};

export type WalletConnectDisconnectInput = {
	topic: string;
};

export type WalletConnectSessionNamespace = {
	accounts: string[];
	chains?: string[];
	events: string[];
	methods: string[];
};

export type WalletConnectSessionNamespaces = Record<string, WalletConnectSessionNamespace>;

export type WalletConnectSessionSummary = {
	expiry: number;
	namespaces: WalletConnectSessionNamespaces;
	peer: WalletConnectPeerMetadata;
	topic: string;
};

export type WalletConnectProposalSummary = {
	expiryTimestamp: number;
	id: number;
	optionalNamespaces: string[];
	peer: WalletConnectPeerMetadata;
	requiredNamespaces: string[];
};

export type WalletConnectRequestSummary = {
	chainId: string;
	id: number;
	method: string;
	topic: string;
};

export type WalletConnectStatus = {
	isConfigured: boolean;
	isInitialized: boolean;
	lastError: string | null;
	pendingProposals: WalletConnectProposalSummary[];
	pendingRequests: WalletConnectRequestSummary[];
	relayStatus: WalletConnectRelayStatus;
	sessions: WalletConnectSessionSummary[];
	supportedNamespaces: string[];
};

export type WalletConnectConfirmationRequest = {
	data?: unknown;
	message?: string;
	title: string;
};

export type WalletConnectConfirmationHandler = (
	request: WalletConnectConfirmationRequest,
) => Promise<boolean>;
