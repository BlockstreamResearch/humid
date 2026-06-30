import { getUnlockedChainRecord } from "@/core/chains/application/chain-store/secureChainStore";
import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";

import { LIQUID_CHAIN_IDS, type LiquidChainId } from "../domain/LiquidChain";
import { createBuiltInLiquidChains } from "./createBuiltInLiquidChains";
import {
	LIQUID_CHAIN_GROUP_ID,
	parseLiquidChainRecord,
	type LiquidChainRecord,
} from "./LiquidChainRecord";

const builtInLiquidChains = createBuiltInLiquidChains();

export function resolveLiquidChain(chainId: LiquidChainId): LiquidChainRecord {
	const chain = builtInLiquidChains.find((candidate) => candidate.id === chainId);

	if (!chain) {
		throw new WalletRpcInvalidParamsError(
			"Unsupported Liquid chain ID.",
			{
				chainId,
				supportedChainIds: LIQUID_CHAIN_IDS,
			},
			WALLET_RPC_ERROR_REASONS.UNSUPPORTED_CHAIN,
		);
	}

	return chain;
}

export async function resolveUnlockedLiquidChain(
	chainId: LiquidChainId,
): Promise<LiquidChainRecord> {
	const storedChain = await getUnlockedChainRecord(chainId);

	if (storedChain) {
		if (storedChain.chainGroupId !== LIQUID_CHAIN_GROUP_ID) {
			throw new WalletRpcInvalidParamsError(
				"Stored chain does not belong to the Liquid chain group.",
				{
					chainGroupId: storedChain.chainGroupId,
					chainId,
				},
				WALLET_RPC_ERROR_REASONS.UNSUPPORTED_CHAIN,
			);
		}

		return parseLiquidChainRecord(storedChain);
	}

	return resolveLiquidChain(chainId);
}
