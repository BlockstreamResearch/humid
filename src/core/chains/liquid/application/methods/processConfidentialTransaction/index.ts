import { WalletRpcNotImplementedError } from "@/core/wallet-rpc/errors";

import { LIQUID_WALLET_RPC_METHODS } from "../../../domain/LiquidRpc";

export function processLiquidConfidentialTransaction(): never {
	throw new WalletRpcNotImplementedError(
		LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
		"Liquid Wallet ABI confidential transaction processing is not implemented yet.",
	);
}
