/**
 * Popup-facing RPC for viewing and revoking the dapps connected to the wallet. The injected side of
 * these sessions lives in the account model (per-account grants); the WalletConnect side lives in the
 * WalletKit client — the background handler unifies both into one {@link ConnectedDappView} list.
 */
export const dappSessionsRpc = {
	methods: {
		list: "dappSessions.list",
		revoke: "dappSessions.revoke",
	},
} as const;

/** How a connected dapp reaches the wallet — mirrors DappSessionTransport. */
export type ConnectedDappTransport = "injected" | "walletconnect";

/** One connected dapp as the popup renders it: identity + granted scope + the handle to revoke it. */
export type ConnectedDappView = {
	transport: ConnectedDappTransport;
	/** Injected session id — present iff transport === "injected". */
	sessionId?: string;
	/** WalletConnect session topic — present iff transport === "walletconnect". */
	topic?: string;
	/** Display name: the origin host (injected) or the peer name / url host (WalletConnect). */
	label: string;
	/** Full origin (injected) or peer url (WalletConnect) — secondary line + avatar seed. */
	url?: string;
	/** Peer icon url — WalletConnect only today (injected has none yet; see favicon TODO in the UI). */
	iconUrl?: string;
	/** Account groups this dapp is connected to. The popup filters the list by the viewed account. */
	accountGroupIds: string[];
	chains: string[];
	methods: string[];
	events: string[];
	/** When the session was granted (ms since epoch). Injected only. */
	connectedAt?: number;
};

/**
 * The revoke target. An injected grant is dropped per-account (the session survives for its other
 * accounts, and is deleted only when this was its last one); a WalletConnect session is ended whole
 * — v1 does not model per-account WalletConnect removal.
 */
export type DappSessionRevokeInput =
	| { transport: "injected"; sessionId: string; accountGroupId: string }
	| { transport: "walletconnect"; topic: string };
