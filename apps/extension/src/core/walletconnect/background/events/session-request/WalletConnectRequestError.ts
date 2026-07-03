import { getSdkError, type SdkErrorKey } from "@walletconnect/utils";

export class WalletConnectRequestError extends Error {
	readonly code: number;

	constructor(key: SdkErrorKey, context?: string | number) {
		const sdkError = getSdkError(key, context);

		super(sdkError.message);
		this.name = "WalletConnectRequestError";
		this.code = sdkError.code;
	}
}
