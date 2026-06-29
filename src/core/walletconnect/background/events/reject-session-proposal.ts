import { getSdkError } from "@walletconnect/utils";

import { getErrorMessage } from "../errors";
import { setLastError } from "../state";
import type { WalletKitClient } from "../types";

export async function rejectSessionProposal(walletKit: WalletKitClient, id: number): Promise<void> {
	try {
		await walletKit.rejectSession({
			id,
			reason: getSdkError("USER_REJECTED"),
		});
	} catch (error) {
		setLastError(getErrorMessage(error));
	}
}
