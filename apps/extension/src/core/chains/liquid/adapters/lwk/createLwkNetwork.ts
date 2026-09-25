import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";

import { LIQUID_NETWORK_KINDS, type LiquidChainRecord } from "../../chains/LiquidChainRecord";
import type { LwkWasmModule } from "./loadLwkWasm";

export type LwkNetwork = ReturnType<LwkWasmModule["Network"]["mainnet"]>;

export function createLwkNetwork(lwk: LwkWasmModule, chain: LiquidChainRecord): LwkNetwork {
	const { network, policyAsset } = chain.settings;

	switch (network) {
		case LIQUID_NETWORK_KINDS.MAINNET:
			return lwk.Network.mainnet();
		case LIQUID_NETWORK_KINDS.TESTNET:
			return lwk.Network.testnet();
		case LIQUID_NETWORK_KINDS.REGTEST:
			return policyAsset
				? lwk.Network.regtest(new lwk.AssetId(policyAsset))
				: lwk.Network.regtestDefault();
		default:
			throw new WalletRpcInvalidParamsError(
				"Unsupported Liquid network.",
				{ chainId: chain.id, network },
				WALLET_RPC_ERROR_REASONS.UNSUPPORTED_CHAIN,
			);
	}
}
