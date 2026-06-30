export const WALLET_RPC_ERROR_CODES = {
	APPLICATION_ERROR: -32000,
	INTERNAL_ERROR: -32603,
	INVALID_PARAMS: -32602,
	METHOD_NOT_FOUND: -32601,
	RESOURCE_UNAVAILABLE: -32002,
} as const;

export const WALLET_RPC_ERROR_REASONS = {
	ACCOUNT_MISMATCH: "account_mismatch",
	ASSET_CHAIN_MISMATCH: "asset_chain_mismatch",
	CONFIRMATION_UNAVAILABLE: "confirmation_unavailable",
	INCOMPATIBLE_LOCAL_ROOT_ENTROPY: "incompatible_local_root_entropy",
	IDENTITY_DERIVATION_FAILED: "identity_derivation_failed",
	INTERNAL_ERROR: "internal_error",
	INVALID_ASSET_ID: "invalid_asset_id",
	INVALID_IDENTITY_PUBLIC_KEY: "invalid_identity_public_key",
	INVALID_IDENTITY_REQUEST: "invalid_identity_request",
	INVALID_LOCAL_ROOT_MATERIAL: "invalid_local_root_material",
	INVALID_MESSAGE_SIGNING_REQUEST: "invalid_message_signing_request",
	INVALID_PARAMS: "invalid_params",
	INVALID_PSET_REQUEST: "invalid_pset_request",
	INVALID_RAW_ASSET_ID: "invalid_raw_asset_id",
	INVALID_TRANSFER_REQUEST: "invalid_transfer_request",
	METHOD_NOT_FOUND: "method_not_found",
	MISSING_LOCAL_ROOT_KEYRING: "missing_local_root_keyring",
	NOT_IMPLEMENTED: "not_implemented",
	RESOURCE_UNAVAILABLE: "resource_unavailable",
	UNSUPPORTED_CHAIN: "unsupported_chain",
	UNSUPPORTED_DESCRIPTOR_FORMAT: "unsupported_descriptor_format",
	UNSUPPORTED_DESCRIPTOR_TYPE: "unsupported_descriptor_type",
	UNSUPPORTED_MEMO: "unsupported_memo",
	UNSUPPORTED_MESSAGE_SIGNING_PROTOCOL: "unsupported_message_signing_protocol",
	UNSUPPORTED_METHOD: "unsupported_method",
	USER_REJECTED: "user_rejected",
	WALLET_DESCRIPTOR_READ_FAILED: "wallet_descriptor_read_failed",
	WALLET_DERIVATION_FAILED: "wallet_derivation_failed",
	WALLET_MESSAGE_SIGNING_FAILED: "wallet_message_signing_failed",
	WALLET_PSET_BROADCAST_FAILED: "wallet_pset_broadcast_failed",
	WALLET_PSET_SIGNING_FAILED: "wallet_pset_signing_failed",
	WALLET_SYNC_FAILED: "wallet_sync_failed",
	WALLET_TRANSFER_FAILED: "wallet_transfer_failed",
	WALLET_UTXO_READ_FAILED: "wallet_utxo_read_failed",
} as const;

export type WalletRpcErrorCode =
	(typeof WALLET_RPC_ERROR_CODES)[keyof typeof WALLET_RPC_ERROR_CODES];

export type WalletRpcErrorReason =
	(typeof WALLET_RPC_ERROR_REASONS)[keyof typeof WALLET_RPC_ERROR_REASONS];

export type WalletRpcErrorData = {
	reason: WalletRpcErrorReason;
	[key: string]: unknown;
};

export class WalletRpcError extends Error {
	readonly code: WalletRpcErrorCode;
	readonly data: WalletRpcErrorData;

	constructor(
		code: WalletRpcErrorCode,
		message: string,
		reason: WalletRpcErrorReason,
		data?: unknown,
	) {
		super(message);
		this.name = "WalletRpcError";
		this.code = code;
		this.data = createWalletRpcErrorData(reason, data);
	}
}

export class WalletRpcInvalidParamsError extends WalletRpcError {
	constructor(
		message: string,
		data?: unknown,
		reason: WalletRpcErrorReason = WALLET_RPC_ERROR_REASONS.INVALID_PARAMS,
	) {
		super(WALLET_RPC_ERROR_CODES.INVALID_PARAMS, message, reason, data);
		this.name = "WalletRpcInvalidParamsError";
	}
}

export class WalletRpcMethodNotFoundError extends WalletRpcError {
	constructor(method: string) {
		super(
			WALLET_RPC_ERROR_CODES.METHOD_NOT_FOUND,
			`Unsupported wallet RPC method: ${method}`,
			WALLET_RPC_ERROR_REASONS.METHOD_NOT_FOUND,
			{
				method,
			},
		);
		this.name = "WalletRpcMethodNotFoundError";
	}
}

export class WalletRpcNotImplementedError extends WalletRpcError {
	constructor(method: string, message?: string) {
		super(
			WALLET_RPC_ERROR_CODES.APPLICATION_ERROR,
			message ?? `Wallet RPC method is not implemented: ${method}`,
			WALLET_RPC_ERROR_REASONS.NOT_IMPLEMENTED,
			{
				method,
			},
		);
		this.name = "WalletRpcNotImplementedError";
	}
}

export class WalletRpcResourceUnavailableError extends WalletRpcError {
	constructor(
		message: string,
		data?: unknown,
		reason: WalletRpcErrorReason = WALLET_RPC_ERROR_REASONS.RESOURCE_UNAVAILABLE,
	) {
		super(WALLET_RPC_ERROR_CODES.RESOURCE_UNAVAILABLE, message, reason, data);
		this.name = "WalletRpcResourceUnavailableError";
	}
}

export class WalletRpcUnsupportedMethodError extends WalletRpcError {
	constructor(method: string, reason?: string) {
		super(
			WALLET_RPC_ERROR_CODES.METHOD_NOT_FOUND,
			reason ?? `Unsupported method: ${method}`,
			WALLET_RPC_ERROR_REASONS.UNSUPPORTED_METHOD,
			{
				method,
			},
		);
		this.name = "WalletRpcUnsupportedMethodError";
	}
}

export class WalletRpcUserRejectedError extends WalletRpcError {
	constructor(message = "User rejected the request.") {
		super(
			WALLET_RPC_ERROR_CODES.APPLICATION_ERROR,
			message,
			WALLET_RPC_ERROR_REASONS.USER_REJECTED,
		);
		this.name = "WalletRpcUserRejectedError";
	}
}

function createWalletRpcErrorData(
	reason: WalletRpcErrorReason,
	data?: unknown,
): WalletRpcErrorData {
	if (typeof data === "undefined") {
		return { reason };
	}

	if (isRecord(data)) {
		return {
			...data,
			reason,
		};
	}

	return {
		details: data,
		reason,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
