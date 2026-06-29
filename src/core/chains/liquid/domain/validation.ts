import { z } from "zod";

import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";

import type { LiquidAssetId, ParsedLiquidAssetId } from "./LiquidAsset";
import { LIQUID_CHAIN_IDS, type LiquidChainId } from "./LiquidChain";
import type { LiquidGetBalanceParams } from "./LiquidRpc";

const liquidChainIdSchema = z.enum(LIQUID_CHAIN_IDS);

const liquidAssetIdSchema = z.string().regex(/^bip122:[0-9a-f]{32}\/elip144:[0-9a-f]{64}$/u);

const liquidGetBalanceParamsSchema = z
	.object({
		assetId: liquidAssetIdSchema.optional(),
	})
	.optional();

export function parseLiquidChainId(value: string): LiquidChainId {
	const parsed = liquidChainIdSchema.safeParse(value);

	if (!parsed.success) {
		throw new WalletRpcInvalidParamsError(
			"Unsupported Liquid chain ID.",
			{
				chainId: value,
				supportedChainIds: LIQUID_CHAIN_IDS,
			},
			WALLET_RPC_ERROR_REASONS.UNSUPPORTED_CHAIN,
		);
	}

	return parsed.data;
}

export function parseLiquidAssetId(
	value: string,
	expectedChainId: LiquidChainId,
): ParsedLiquidAssetId {
	const parsed = liquidAssetIdSchema.safeParse(value);

	if (!parsed.success) {
		throw new WalletRpcInvalidParamsError(
			"Invalid Liquid ELIP-0144 asset ID.",
			{
				assetId: value,
			},
			WALLET_RPC_ERROR_REASONS.INVALID_ASSET_ID,
		);
	}

	const [chainId, rawAssetId] = parsed.data.split("/elip144:");
	const liquidChainId = parseLiquidChainId(chainId);

	if (liquidChainId !== expectedChainId) {
		throw new WalletRpcInvalidParamsError(
			"Liquid asset ID chain does not match request chain.",
			{
				assetChainId: liquidChainId,
				requestChainId: expectedChainId,
			},
			WALLET_RPC_ERROR_REASONS.ASSET_CHAIN_MISMATCH,
		);
	}

	return {
		assetId: parsed.data as LiquidAssetId,
		chainId: liquidChainId,
		rawAssetId,
	};
}

export function parseLiquidGetBalanceParams(value: unknown): LiquidGetBalanceParams {
	const parsed = liquidGetBalanceParamsSchema.safeParse(value);

	if (!parsed.success) {
		throw new WalletRpcInvalidParamsError("Invalid getBalance parameters.", parsed.error.flatten());
	}

	return {
		assetId: parsed.data?.assetId as LiquidAssetId | undefined,
	};
}

export function toLiquidAssetId(chainId: LiquidChainId, rawAssetId: string): LiquidAssetId {
	if (!/^[0-9a-f]{64}$/u.test(rawAssetId)) {
		throw new WalletRpcInvalidParamsError(
			"Invalid raw Liquid asset ID.",
			{ rawAssetId },
			WALLET_RPC_ERROR_REASONS.INVALID_RAW_ASSET_ID,
		);
	}

	return `${chainId}/elip144:${rawAssetId}`;
}
