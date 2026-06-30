import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidWalletAccount } from "../../../ports/LiquidWalletBackend";
import { getLwkImplementation } from "./getLwkImplementation";

export async function scanAccount(account: LiquidWalletAccount): Promise<void> {
	const implementation = getLwkImplementation(account);

	try {
		const update = await implementation.network
			.defaultEsploraClient()
			.fullScan(implementation.wollet);

		if (update) {
			implementation.wollet.applyUpdate(update);
		}
	} catch {
		throw new WalletRpcResourceUnavailableError(
			"Could not sync the Liquid wallet through the LWK Esplora backend.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_SYNC_FAILED,
		);
	}
}
