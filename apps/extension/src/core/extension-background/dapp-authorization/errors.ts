/**
 * Errors surfaced to dapps over the injected CAIP-25/27 surface. Codes follow
 * EIP-1193 provider errors where applicable and CAIP-25 (5xxx) for scope issues.
 */
export const DAPP_AUTHORIZATION_ERROR_CODES = {
	INVALID_PARAMS: -32602,
	UNAUTHORIZED: 4100, // no / expired session for the requested method
	UNRECOGNIZED_CHAIN: 4902, // wallet_switchChain to an unknown chain — call wallet_addChain first
	UNSUPPORTED_SCOPES: 5100, // none of the requested CAIP-25 scopes are supported
	USER_REJECTED: 4001,
	WALLET_LOCKED: 4900, // EIP-1193 "disconnected"; used while the vault is locked
} as const;

export type DappAuthorizationErrorCode =
	(typeof DAPP_AUTHORIZATION_ERROR_CODES)[keyof typeof DAPP_AUTHORIZATION_ERROR_CODES];

export class DappAuthorizationError extends Error {
	readonly code: DappAuthorizationErrorCode;
	readonly data?: unknown;

	constructor(code: DappAuthorizationErrorCode, message: string, data?: unknown) {
		super(message);
		this.name = "DappAuthorizationError";
		this.code = code;
		this.data = data;
	}
}

export const dappAuthorizationErrors = {
	invalidParams: (message: string, data?: unknown) =>
		new DappAuthorizationError(DAPP_AUTHORIZATION_ERROR_CODES.INVALID_PARAMS, message, data),
	unauthorized: (message: string, data?: unknown) =>
		new DappAuthorizationError(DAPP_AUTHORIZATION_ERROR_CODES.UNAUTHORIZED, message, data),
	unrecognizedChain: (message: string, data?: unknown) =>
		new DappAuthorizationError(DAPP_AUTHORIZATION_ERROR_CODES.UNRECOGNIZED_CHAIN, message, data),
	unsupportedScopes: (message: string, data?: unknown) =>
		new DappAuthorizationError(DAPP_AUTHORIZATION_ERROR_CODES.UNSUPPORTED_SCOPES, message, data),
	userRejected: (message: string, data?: unknown) =>
		new DappAuthorizationError(DAPP_AUTHORIZATION_ERROR_CODES.USER_REJECTED, message, data),
	walletLocked: (message: string, data?: unknown) =>
		new DappAuthorizationError(DAPP_AUTHORIZATION_ERROR_CODES.WALLET_LOCKED, message, data),
};
