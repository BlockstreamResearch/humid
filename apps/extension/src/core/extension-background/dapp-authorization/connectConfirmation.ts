export const DAPP_CONNECT_CONFIRMATION_KIND = "dappConnect";

export const DAPP_CONNECT_LIST_ACCOUNTS_METHOD = "dappConnect.listAccounts";

export type DappConnectAccount = {
	id: string;
	isConnected: boolean;
	isCurrent: boolean;
	name: string;
};

export type DappConnectConfirmationData = {
	accounts: DappConnectAccount[];
	chains: string[];
	kind: typeof DAPP_CONNECT_CONFIRMATION_KIND;
	methods: string[];
	origin: string;
	requiresUnlock: boolean;
};

export type DappConnectConfirmationResult = {
	grantedAccountGroupIds: string[];
	grantedMethods: string[];
};

export function isDappConnectConfirmationData(data: unknown): data is DappConnectConfirmationData {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as { kind?: unknown }).kind === DAPP_CONNECT_CONFIRMATION_KIND
	);
}

export const DAPP_ADD_CHAIN_CONFIRMATION_KIND = "dappAddChain";

export type DappAddChainConfirmationData = {
	backendUrl: string;
	kind: typeof DAPP_ADD_CHAIN_CONFIRMATION_KIND;
	name: string;
	network: string;
	origin: string;
};

export function isDappAddChainConfirmationData(
	data: unknown,
): data is DappAddChainConfirmationData {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as { kind?: unknown }).kind === DAPP_ADD_CHAIN_CONFIRMATION_KIND
	);
}

export const DAPP_SWITCH_CHAIN_CONFIRMATION_KIND = "dappSwitchChain";

export type DappSwitchChainConfirmationData = {
	chainId: string;
	chainName: string;
	kind: typeof DAPP_SWITCH_CHAIN_CONFIRMATION_KIND;
	origin: string;
};

export function isDappSwitchChainConfirmationData(
	data: unknown,
): data is DappSwitchChainConfirmationData {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as { kind?: unknown }).kind === DAPP_SWITCH_CHAIN_CONFIRMATION_KIND
	);
}
