/** Discriminant marking a confirmation request as the dapp-connect (grant permissions) flow. */
export const DAPP_CONNECT_CONFIRMATION_KIND = "dappConnect";

/**
 * Popup-facing internal RPC the connect modal calls to load the selectable accounts once the
 * vault is unlocked. Needed because the account list only exists in memory while unlocked, so a
 * connect request that arrives on a locked wallet unlocks first and then fetches the accounts.
 */
export const DAPP_CONNECT_LIST_ACCOUNTS_METHOD = "dappConnect.listAccounts";

/** One selectable account (account group) shown in the connect modal's account list. */
export type DappConnectAccount = {
	/** The account group id (also the granted scope entry). */
	id: string;
	/** Whether the origin's active session already grants this account (checked by default too). */
	isConnected: boolean;
	/** Whether this is the wallet's currently selected account (checked by default). */
	isCurrent: boolean;
	name: string;
};

/**
 * `ConfirmationRequest.data` payload for the connect modal. Authorization is per
 * account (MetaMask-style): the user picks which accounts to expose (current one
 * checked by default) and which methods may run without a per-call confirmation.
 */
export type DappConnectConfirmationData = {
	/** Selectable accounts. Empty when `requiresUnlock` — the modal fetches them post-unlock. */
	accounts: DappConnectAccount[];
	chains: string[];
	kind: typeof DAPP_CONNECT_CONFIRMATION_KIND;
	/** The session's whole method surface: every method it may call, on offer to pre-approve. */
	methods: string[];
	origin: string;
	/** The wallet is locked: the modal shows an unlock step before the account list. */
	requiresUnlock: boolean;
};

/**
 * The connect modal's structured result: the account groups the user exposed, and the subset of
 * {@link DappConnectConfirmationData.methods} they let run without asking. Every offered method
 * stays callable either way — an unticked one just confirms on every call.
 */
export type DappConnectConfirmationResult = {
	grantedAccountGroupIds: string[];
	grantedMethods: string[];
};

/** Type guard: is this confirmation `data` a dapp-connect payload (has permission checkboxes)? */
export function isDappConnectConfirmationData(data: unknown): data is DappConnectConfirmationData {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as { kind?: unknown }).kind === DAPP_CONNECT_CONFIRMATION_KIND
	);
}

/** Discriminant marking a confirmation as the dapp-proposed add-chain (EIP-3085-style) flow. */
export const DAPP_ADD_CHAIN_CONFIRMATION_KIND = "dappAddChain";

/**
 * `ConfirmationRequest.data` for the add-chain approval. Surfaces the proposed network's details so
 * the user can judge it BEFORE the wallet ever hits the backend — the backend URL is the security-
 * sensitive field (a dapp can push an unvetted Esplora endpoint the wallet would otherwise trust).
 * The wallet mints its own chain id, so no dapp-supplied id is shown or trusted.
 */
export type DappAddChainConfirmationData = {
	/** Esplora backend base URL the wallet will connect to for this chain. */
	backendUrl: string;
	kind: typeof DAPP_ADD_CHAIN_CONFIRMATION_KIND;
	/** Proposed human-readable chain name. */
	name: string;
	/** Target network: "mainnet" | "testnet" | "regtest". */
	network: string;
	origin: string;
};

/** Type guard: is this confirmation `data` an add-chain payload? */
export function isDappAddChainConfirmationData(
	data: unknown,
): data is DappAddChainConfirmationData {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as { kind?: unknown }).kind === DAPP_ADD_CHAIN_CONFIRMATION_KIND
	);
}

/** Discriminant marking a confirmation as the dapp-facing switch-chain (widen session scope) flow. */
export const DAPP_SWITCH_CHAIN_CONFIRMATION_KIND = "dappSwitchChain";

/**
 * `ConfirmationRequest.data` for the switch-chain approval. wallet_switchChain widens THIS origin's
 * session to a chain the wallet already knows but hasn't yet granted this connection — a per-
 * connection scope expansion, so the user consents to adding it to the dapp's session.
 */
export type DappSwitchChainConfirmationData = {
	/** The (already-known) chain being added to this origin's session. */
	chainId: string;
	/** Human-readable name of that chain. */
	chainName: string;
	kind: typeof DAPP_SWITCH_CHAIN_CONFIRMATION_KIND;
	origin: string;
};

/** Type guard: is this confirmation `data` a switch-chain payload? */
export function isDappSwitchChainConfirmationData(
	data: unknown,
): data is DappSwitchChainConfirmationData {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as { kind?: unknown }).kind === DAPP_SWITCH_CHAIN_CONFIRMATION_KIND
	);
}
