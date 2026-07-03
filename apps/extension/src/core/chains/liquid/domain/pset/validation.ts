import { z } from "zod";

import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";

import type { ParsedLiquidSignPsetParams } from "./types";

const allowedSighashTypeSchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(129),
	z.literal(130),
	z.literal(131),
]);

const signPsetInputSchema = z
	.object({
		address: z.string().min(1).max(4096),
		index: z.number().int().min(0),
		sighashTypes: z.array(allowedSighashTypeSchema).min(1).optional().default([1]),
	})
	.strict();

const signPsetParamsSchema = z
	.object({
		broadcast: z.boolean().optional().default(false),
		pset: z.string().min(1).max(1_000_000),
		signInputs: z.array(signPsetInputSchema).min(1),
	})
	.strict();

export function parseLiquidSignPsetParams(value: unknown): ParsedLiquidSignPsetParams {
	const parsed = signPsetParamsSchema.safeParse(value);

	if (!parsed.success) {
		throw new WalletRpcInvalidParamsError(
			"Invalid signPset parameters.",
			parsed.error.flatten(),
			WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST,
		);
	}

	return parsed.data;
}
