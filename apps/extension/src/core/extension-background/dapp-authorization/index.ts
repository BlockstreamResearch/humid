export {
	createDappAuthorization,
	type DappAuthorization,
	type DappAuthorizationDependencies,
	type DappRequestDispatch,
	DEFAULT_INJECTED_SESSION_TTL_MS,
	type PreparedChainAddition,
	type SupportedDappScope,
} from "./createDappAuthorization";
export { createDappConnectInternalHandlers } from "./connectableAccounts";
export {
	createDappSessionsInternalHandlers,
	type DappSessionsHandlersDependencies,
} from "./dappSessions";
export {
	DAPP_ADD_CHAIN_CONFIRMATION_KIND,
	DAPP_CONNECT_CONFIRMATION_KIND,
	DAPP_SWITCH_CHAIN_CONFIRMATION_KIND,
	type DappAddChainConfirmationData,
	type DappConnectConfirmationData,
	type DappConnectConfirmationResult,
	type DappSwitchChainConfirmationData,
	isDappAddChainConfirmationData,
	isDappConnectConfirmationData,
	isDappSwitchChainConfirmationData,
} from "./connectConfirmation";
export {
	DAPP_AUTHORIZATION_ERROR_CODES,
	DappAuthorizationError,
	type DappAuthorizationErrorCode,
} from "./errors";
