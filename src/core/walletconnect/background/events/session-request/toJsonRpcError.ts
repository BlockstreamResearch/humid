import {
	WALLET_RPC_ERROR_CODES,
	WALLET_RPC_ERROR_REASONS,
	WalletRpcError,
} from "@/core/wallet-rpc/errors";

import { getErrorMessage } from "../../errors";
import { WalletConnectRequestError } from "./WalletConnectRequestError";

export function toJsonRpcError(error: unknown): { code: number; data?: unknown; message: string } {
	if (error instanceof WalletConnectRequestError) {
		return {
			code: error.code,
			message: error.message,
		};
	}

	if (error instanceof WalletRpcError) {
		return {
			code: error.code,
			data: error.data,
			message: error.message,
		};
	}

	return {
		code: WALLET_RPC_ERROR_CODES.INTERNAL_ERROR,
		data: {
			reason: WALLET_RPC_ERROR_REASONS.INTERNAL_ERROR,
		},
		message: getErrorMessage(error),
	};
}
