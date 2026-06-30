import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { getLwkImplementation } from "./getLwkImplementation";

export async function scanAccount(account: LiquidWalletAccount): Promise<void> {
	const implementation = getLwkImplementation(account);

	try {
		const update = await implementation.blockchainClient.fullScan(implementation.wollet);

		if (update) {
			implementation.wollet.applyUpdate(update);
		}
	} catch {
		throw new WalletRpcResourceUnavailableError(
			"Could not sync the Liquid wallet through the configured LWK blockchain backend.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_SYNC_FAILED,
		);
	}
}
