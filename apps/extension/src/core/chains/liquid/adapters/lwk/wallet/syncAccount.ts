import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { loadLwkWasm } from "../loadLwkWasm";
import { getSyncWorkerClient } from "../sync-worker/createSyncWorkerClient";
import { getLwkImplementation } from "./getLwkImplementation";

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
