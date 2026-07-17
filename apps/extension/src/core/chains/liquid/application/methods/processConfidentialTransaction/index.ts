import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import { WalletRpcNotImplementedError } from "@/core/wallet-rpc/errors";
import type { WalletRpcBaseContext } from "@/core/wallet-rpc/types";

import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";

/**
 * Liquid Wallet ABI confidential transaction processing (ELIP-1, optional and not
 * yet implemented). Wrapped as a proper method so it self-registers on the Liquid RPC
 * surface and rejects with a not-implemented error when a dapp invokes it.
 */
export const processLiquidConfidentialTransaction = createWalletMethod<
	null,
	WalletRpcBaseContext,
	null,
	never
>({
	confirmation: () => ({
		data: {
			kind: "liquid.processConfidentialTransaction",
		},
		message: "A dapp wants to process a Liquid confidential transaction.",
		title: "Process Liquid confidential transaction?",
	}),
	execute: () => {
		throw new WalletRpcNotImplementedError(
			LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
			"Liquid Wallet ABI confidential transaction processing is not implemented yet.",
		);
	},
	id: LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
	parse: () => null,
	review: () => null,
});
