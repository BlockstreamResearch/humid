import { getSdkError } from "@walletconnect/utils";

import { WalletConnectRequestError } from "../../capabilities";
import { getErrorMessage } from "../errors";

export function toJsonRpcError(error: unknown): { code: number; message: string } {
	if (error instanceof WalletConnectRequestError) {
		return {
			code: error.code,
			message: error.message,
		};
	}

	const sdkError = getSdkError("USER_REJECTED");

	return {
		code: sdkError.code,
		message: getErrorMessage(error),
	};
}
