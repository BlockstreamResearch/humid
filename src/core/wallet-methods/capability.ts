import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

/**
 * Access class of a wallet RPC method. It decides what happens when a dapp invokes
 * a method whose capability its session did not grant:
 * - `read`   → return a RESTRICTED/empty stub (graceful; the dapp keeps working).
 * - `action` → raise a JSON-RPC error (the wallet refuses to act without consent).
 */
export type WalletMethodAccess = "action" | "read";

/**
 * Stable ids for the permission groups surfaced at connect time. With per-method
 * checkbox granularity these act as section headers that cluster related methods
 * (e.g. the identity reads and the identity signature all live under `identity`).
 * Chain-agnostic: every chain's methods map onto the same groups.
 */
export const WALLET_CAPABILITY_GROUPS = {
	ADVANCED: "advanced",
	IDENTITY: "identity",
	SEND_FUNDS: "send-funds",
	SIGN_MESSAGES: "sign-messages",
	SIGN_TRANSACTIONS: "sign-transactions",
	VIEW_ADDRESSES: "view-addresses",
	VIEW_BALANCES: "view-balances",
} as const;

export type WalletCapabilityGroup =
	(typeof WALLET_CAPABILITY_GROUPS)[keyof typeof WALLET_CAPABILITY_GROUPS];

/**
 * Declarative permission descriptor attached to a wallet RPC method. It powers two
 * layers at once: the connect-time permission checkboxes (`label`/`description`/
 * `group`) and invoke-time enforcement (`access` + the `restricted` read stub).
 */
export type WalletMethodCapability<TParams, TContext extends WalletRpcBaseContext, TResult> = {
	access: WalletMethodAccess;
	/** Human-facing checkbox description shown at connect time. */
	description: string;
	group: WalletCapabilityGroup;
	/** Stable capability id. With per-method granularity this is the RPC method name. */
	id: string;
	/** Human-facing checkbox label shown at connect time. */
	label: string;
	/**
	 * Result returned for a `read` method whose capability was not granted. Must be
	 * cheap and must not leak protected data — return "RESTRICTED"/empty fields, and
	 * do not resolve the account or touch chain state. Omit for `action` methods:
	 * those hard-error instead of degrading.
	 */
	restricted?: (input: { context: TContext; params: TParams }) => Promise<TResult> | TResult;
};

/**
 * Serializable projection of a capability: the metadata the connect UI renders as a
 * checkbox and the enforcement layer keys off. Excludes `restricted` — a function,
 * which cannot cross the popup/background message boundary; that stub stays on the
 * method and is applied in-process by the wrapper.
 */
export type WalletCapabilityDescriptor = {
	access: WalletMethodAccess;
	description: string;
	group: WalletCapabilityGroup;
	id: string;
	label: string;
};

/** Projects a capability down to its serializable descriptor (drops `restricted`). */
export function toWalletCapabilityDescriptor(
	capability: WalletCapabilityDescriptor,
): WalletCapabilityDescriptor {
	const { access, description, group, id, label } = capability;

	return { access, description, group, id, label };
}
