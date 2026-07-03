import type { WalletCapabilityDescriptor } from "@/core/wallet-methods/capability";

/** Discriminant marking a confirmation request as the dapp-connect (grant permissions) flow. */
export const DAPP_CONNECT_CONFIRMATION_KIND = "dappConnect";

/** One selectable account (account group) shown in the connect modal's account list. */
export type DappConnectAccount = {
	/** The account group id (also the granted scope entry). */
	id: string;
	/** Whether this is the wallet's currently selected account (checked by default). */
	isCurrent: boolean;
	name: string;
};

/**
 * `ConfirmationRequest.data` payload for the connect modal. Authorization is per
 * account (MetaMask-style): the user picks which accounts to expose (current one
 * checked by default) and which per-method capabilities to grant.
 */
export type DappConnectConfirmationData = {
	accounts: DappConnectAccount[];
	capabilities: WalletCapabilityDescriptor[];
	chains: string[];
	kind: typeof DAPP_CONNECT_CONFIRMATION_KIND;
	origin: string;
};

/** The connect modal's structured result: the account groups and capabilities the user granted. */
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
