import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { getLwkImplementation } from "./getLwkImplementation";

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
