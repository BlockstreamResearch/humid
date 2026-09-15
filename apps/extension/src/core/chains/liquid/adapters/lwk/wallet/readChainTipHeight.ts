import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { getLwkImplementation } from "./getLwkImplementation";

/**
 * How high the chain is, as this wallet already knows it.
 *
 * Read from the scan rather than from an endpoint. The wallet syncs its descriptor against
 * whichever backend a chain is configured with, and the tip is what that scan reached — so it
 * costs no network call and is available wherever the wallet works. A plain Esplora route for
 * the same fact is not universal: the Waterfalls server this wallet uses for Liquid testnet
 * serves the descriptor scan and answers 404 to `/blocks/tip/height`, which is exactly how a
 * transaction that should have declared a locktime came to declare zero.
 *
 * Accurate as of the last sync, which for a contract action is moments earlier: the method
 * syncs the account before it reviews anything.
 */
export function readChainTipHeight(account: LiquidWalletAccount): number {
	const implementation = getLwkImplementation(account);
	const tip = implementation.wollet.tip();

	try {
		return tip.height();
	} catch {
		throw new WalletRpcResourceUnavailableError(
			"Could not read the chain tip from the LWK wallet state.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_UTXO_READ_FAILED,
		);
	}
}
