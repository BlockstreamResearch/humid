import { z } from "zod";

import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";

import type { LiquidAssetId, ParsedLiquidAssetId } from "./LiquidAsset";
import { LIQUID_CHAIN_IDS, type LiquidChainId } from "./LiquidChain";
import {
	LIQUID_DESCRIPTOR_FORMATS,
	LIQUID_DESCRIPTOR_TYPES,
	type LiquidGetBalanceParams,
	type LiquidGetUTXOsParams,
	type LiquidGetWalletDescriptorParams,
	type LiquidSendTransferParams,
} from "./LiquidRpc";

const liquidChainIdSchema = z.enum(LIQUID_CHAIN_IDS);

const liquidAssetIdSchema = z.string().regex(/^bip122:[0-9a-f]{32}\/elip144:[0-9a-f]{64}$/u);

const liquidGetBalanceParamsSchema = z
	.object({
		assetId: liquidAssetIdSchema.optional(),
	})
	.optional();

const liquidGetUTXOsParamsSchema = liquidGetBalanceParamsSchema;

const liquidDescriptorFormatSchema = z.object({
	format: z.string().min(1),
});

const liquidGetWalletDescriptorParamsSchema = z
	.object({
		descriptorFormat: z.array(liquidDescriptorFormatSchema).min(1).optional(),
		descriptorType: z
			.enum([
				LIQUID_DESCRIPTOR_TYPES.PUBLIC_WALLET_DESCRIPTOR,
				LIQUID_DESCRIPTOR_TYPES.PUBLIC_CONFIDENTIAL_DESCRIPTOR,
			])
			.default(LIQUID_DESCRIPTOR_TYPES.PUBLIC_WALLET_DESCRIPTOR),
	})
	.optional();

const unsignedDecimalStringSchema = z.string().regex(/^(0|[1-9][0-9]*)$/u);

const liquidSendTransferParamsSchema = z
	.object({
		account: z.string().optional(),
		amount: unsignedDecimalStringSchema.refine((value) => BigInt(value) > 0n, {
			message: "Amount must be greater than zero.",
		}),
		assetId: liquidAssetIdSchema.optional(),
		memo: z
			.string()
			.regex(/^(?:[0-9a-f]{2})*$/u)
			.refine((value) => value.length / 2 <= 80, {
				message: "Memo must be at most 80 bytes.",
			})
			.optional(),
		recipientAddress: z.string().min(1),
	})
	.strict();

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

export function parseLiquidGetUTXOsParams(value: unknown): LiquidGetUTXOsParams {
	const parsed = liquidGetUTXOsParamsSchema.safeParse(value);

	if (!parsed.success) {
		throw new WalletRpcInvalidParamsError("Invalid getUTXOs parameters.", parsed.error.flatten());
	}

	return {
		assetId: parsed.data?.assetId as LiquidAssetId | undefined,
	};
}

export function parseLiquidGetWalletDescriptorParams(
	value: unknown,
): LiquidGetWalletDescriptorParams {
	const parsed = liquidGetWalletDescriptorParamsSchema.safeParse(value);

	if (!parsed.success) {
		throw new WalletRpcInvalidParamsError(
			"Invalid getWalletDescriptor parameters.",
			parsed.error.flatten(),
		);
	}

	return {
		descriptorFormat: parsed.data?.descriptorFormat,
		descriptorType: parsed.data?.descriptorType ?? LIQUID_DESCRIPTOR_TYPES.PUBLIC_WALLET_DESCRIPTOR,
	};
}

export function parseLiquidSendTransferParams(value: unknown): LiquidSendTransferParams {
	const parsed = liquidSendTransferParamsSchema.safeParse(value);

	if (!parsed.success) {
		throw new WalletRpcInvalidParamsError(
			"Invalid sendTransfer parameters.",
			parsed.error.flatten(),
			WALLET_RPC_ERROR_REASONS.INVALID_TRANSFER_REQUEST,
		);
	}

	return {
		account: parsed.data.account,
		amount: parsed.data.amount,
		assetId: parsed.data.assetId as LiquidAssetId | undefined,
		memo: parsed.data.memo,
		recipientAddress: parsed.data.recipientAddress,
	};
}

export function getSupportedLiquidDescriptorFormats() {
	return [
		LIQUID_DESCRIPTOR_FORMATS.BIP380_BIP389_MULTIPATH,
		LIQUID_DESCRIPTOR_FORMATS.BIP380_SPLIT_BRANCHES,
	] as const;
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
