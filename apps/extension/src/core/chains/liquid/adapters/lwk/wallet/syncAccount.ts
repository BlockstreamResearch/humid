import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { loadLwkWasm } from "../loadLwkWasm";
import { getSyncWorkerClient } from "../sync-worker/createSyncWorkerClient";
import { getLwkImplementation } from "./getLwkImplementation";

/**
 * Sync the account by running the heavy `fullScan` in a dedicated worker (off the
 * background thread) and applying the returned `Update` to this account's wollet. Only
 * the public descriptor is sent to the worker; private keys stay in the background.
 */
export async function scanAccount(account: LiquidWalletAccount): Promise<void> {
	const implementation = getLwkImplementation(account);

	try {
		const { updateBytes } = await getSyncWorkerClient().scan({
			chain: account.chain,
			descriptor: account.descriptor,
		});

		if (updateBytes) {
			const lwk = await loadLwkWasm();
			implementation.wollet.applyUpdate(new lwk.Update(updateBytes));
		}
	} catch (error) {
		console.error("[liquid] Failed to sync the Liquid account", error);

		throw new WalletRpcResourceUnavailableError(
			"Could not sync the Liquid wallet through the configured LWK blockchain backend.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_SYNC_FAILED,
		);
	}
}
