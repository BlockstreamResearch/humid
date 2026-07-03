import { getSdkError } from "@walletconnect/utils";

import type { WalletKitClient } from "../../types";

export async function rejectSessionProposal(walletKit: WalletKitClient, id: number): Promise<void> {
	await walletKit.rejectSession({
		id,
		reason: getSdkError("USER_REJECTED"),
	});
}
