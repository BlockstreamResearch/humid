import { z } from "zod";

import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";

import {
	LIQUID_IDENTITY_CURVE,
	LIQUID_IDENTITY_SHARED_KEY_KDF,
	type ParsedLiquidGetIdentityPublicKeyParams,
	type ParsedLiquidGetIdentitySharedKeyParams,
	type ParsedLiquidSignIdentityParams,
} from "./types";

const identityIndexSchema = z.number().int().min(0).max(0xffffffff).optional().default(0);

const identitySchema = z
	.string()
	.min(1)
	.max(2048)
	.refine((value) => value.trim().length > 0, {
		message: "Identity must not be blank.",
	});

const lowercaseEvenHexSchema = z
	.string()
	.max(8192)
	.regex(/^(?:[0-9a-f]{2})*$/u, "Expected lowercase hex bytes without 0x prefix.");

const nonEmptyLowercaseEvenHexSchema = lowercaseEvenHexSchema.refine((value) => value.length > 0, {
	message: "Expected non-empty lowercase hex bytes.",
});

const uncompressedP256PublicKeySchema = z
	.string()
	.regex(/^04[0-9a-f]{128}$/u, "Expected an uncompressed 65-byte nist256p1 public key.");

const liquidGetIdentityPublicKeyParamsSchema = z
	.object({
		curve: z.literal(LIQUID_IDENTITY_CURVE),
		identity: identitySchema,
		index: identityIndexSchema,
	})
	.strict();

const liquidGetIdentitySharedKeyParamsSchema = z
	.object({
		curve: z.literal(LIQUID_IDENTITY_CURVE),
		identity: identitySchema,
		index: identityIndexSchema,
		kdf: z.literal(LIQUID_IDENTITY_SHARED_KEY_KDF),
		kdfInfo: nonEmptyLowercaseEvenHexSchema,
		kdfSalt: lowercaseEvenHexSchema,
		theirPublicKey: uncompressedP256PublicKeySchema,
	})
	.strict();

const liquidSignIdentityParamsSchema = z
	.object({
		challenge: nonEmptyLowercaseEvenHexSchema,
		curve: z.literal(LIQUID_IDENTITY_CURVE),
		identity: identitySchema,
		index: identityIndexSchema,
	})
	.strict();

export function parseLiquidGetIdentityPublicKeyParams(
	value: unknown,
): ParsedLiquidGetIdentityPublicKeyParams {
	const parsed = liquidGetIdentityPublicKeyParamsSchema.safeParse(value);

	if (!parsed.success) {
		throw new WalletRpcInvalidParamsError(
			"Invalid getIdentityPublicKey parameters.",
			parsed.error.flatten(),
			WALLET_RPC_ERROR_REASONS.INVALID_IDENTITY_REQUEST,
		);
	}

	return parsed.data;
}

export function parseLiquidSignIdentityParams(value: unknown): ParsedLiquidSignIdentityParams {
	const parsed = liquidSignIdentityParamsSchema.safeParse(value);

	if (!parsed.success) {
		throw new WalletRpcInvalidParamsError(
			"Invalid signIdentity parameters.",
			parsed.error.flatten(),
			WALLET_RPC_ERROR_REASONS.INVALID_IDENTITY_REQUEST,
		);
	}

	return parsed.data;
}

export function parseLiquidGetIdentitySharedKeyParams(
	value: unknown,
): ParsedLiquidGetIdentitySharedKeyParams {
	const parsed = liquidGetIdentitySharedKeyParamsSchema.safeParse(value);

	if (!parsed.success) {
		throw new WalletRpcInvalidParamsError(
			"Invalid getIdentitySharedKey parameters.",
			parsed.error.flatten(),
			WALLET_RPC_ERROR_REASONS.INVALID_IDENTITY_REQUEST,
		);
	}

	return parsed.data;
}
