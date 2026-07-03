import { WALLET_CAPABILITY_GROUPS } from "@/core/wallet-methods/capability";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import { WalletRpcNotImplementedError } from "@/core/wallet-rpc/errors";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";

/**
 * Liquid Wallet ABI confidential transaction processing (ELIP-1, optional and not
 * yet implemented). Wrapped as a proper method so it self-registers with its
 * capability and rejects with a not-implemented error when a dapp invokes it.
 */
export const processLiquidConfidentialTransaction = createWalletMethod<
	null,
	WalletRpcBaseContext,
	null,
	never
>({
	capability: {
		access: "action",
		description: "Process confidential transactions via the Liquid wallet ABI.",
		group: WALLET_CAPABILITY_GROUPS.ADVANCED,
		id: LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
		label: "Advanced transactions",
	},
	execute: () => {
		throw new WalletRpcNotImplementedError(
			LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
			"Liquid Wallet ABI confidential transaction processing is not implemented yet.",
		);
	},
	parse: () => null,
	review: () => null,
});
