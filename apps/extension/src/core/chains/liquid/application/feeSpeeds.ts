import { createEsploraFeeRateReader, type ReadFeeRate } from "@humid/tx-manifest";

import type { LiquidChainRecord } from "../chains/LiquidChainRecord";
import type { LiquidSendTransferParams, LiquidTransferQuote } from "../domain/LiquidRpc";
import type { LiquidWalletAccount, LiquidWalletBackend } from "./backends/LiquidWalletBackend";

export const FEE_TARGET_BLOCKS = [60, 10, 1];
export const DEFAULT_TARGET_BLOCKS = 1;
export const DEFAULT_FEE_RATE_SATS_PER_KVB = 100;

export type SpeedRate = { feeRateSatsPerKvb: number; targetBlocks: number };

export type SpeedQuote = LiquidTransferQuote & { targetBlocks: number };

export function readSpeedRates(
	chain: LiquidChainRecord,
	readFeeRate: ReadFeeRate = createEsploraFeeRateReader(chain.settings.backend),
): Promise<SpeedRate[]> {
	return Promise.all(
		FEE_TARGET_BLOCKS.map(async (targetBlocks) => ({
			feeRateSatsPerKvb: await readFeeRate(targetBlocks).catch(() => DEFAULT_FEE_RATE_SATS_PER_KVB),
			targetBlocks,
		})),
	);
}

export function quoteTransferSpeeds(
	walletBackend: LiquidWalletBackend,
	account: LiquidWalletAccount,
	params: LiquidSendTransferParams,
	rawAssetId: string,
	rates: SpeedRate[],
): Promise<SpeedQuote[]> {
	return Promise.all(
		rates.map(async ({ feeRateSatsPerKvb, targetBlocks }) => ({
			...(await walletBackend.quoteTransfer(account, params, rawAssetId, feeRateSatsPerKvb)),
			targetBlocks,
		})),
	);
}

export function chosenTargetBlocks(choice: unknown): number {
	const targetBlocks =
		typeof choice === "object" && choice !== null
			? (choice as { targetBlocks?: unknown }).targetBlocks
			: undefined;

	return typeof targetBlocks === "number" && FEE_TARGET_BLOCKS.includes(targetBlocks)
		? targetBlocks
		: DEFAULT_TARGET_BLOCKS;
}
