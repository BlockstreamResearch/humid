import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";

import {
	LIQUID_CHAIN_IDS,
	LIQUID_MAINNET_CHAIN_ID,
	LIQUID_TESTNET_CHAIN_ID,
	type LiquidChainId,
} from "../../domain/LiquidChain";
import type { LwkWasmModule } from "./loadLwkWasm";

export type LwkNetwork = ReturnType<LwkWasmModule["Network"]["mainnet"]>;

export function createLwkNetwork(lwk: LwkWasmModule, chainId: LiquidChainId): LwkNetwork {
	if (chainId === LIQUID_MAINNET_CHAIN_ID) {
		return lwk.Network.mainnet();
	}

	if (chainId === LIQUID_TESTNET_CHAIN_ID) {
		return lwk.Network.testnet();
	}

	throw new WalletRpcInvalidParamsError(
		"Unsupported Liquid chain ID.",
		{
			chainId,
			supportedChainIds: LIQUID_CHAIN_IDS,
		},
		WALLET_RPC_ERROR_REASONS.UNSUPPORTED_CHAIN,
	);
}
