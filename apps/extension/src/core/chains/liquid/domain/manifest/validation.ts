import { z } from "zod";

import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";

import type { ParsedLiquidProcessCtParams } from "./types";

const jsonObjectSchema = z.record(z.string(), z.unknown());

const processCtParamsSchema = z
	.object({
		action: z.string().min(1).max(256),
		broadcast: z.boolean().optional().default(false),
		contractSources: z.record(z.string().min(1), z.string().min(1).max(1_000_000)),
		instance: jsonObjectSchema.optional(),
		manifest: jsonObjectSchema,
		params: jsonObjectSchema.optional().default({}),
		state: jsonObjectSchema.optional(),
	})
	.strict();

/**
 * Checks the request is well-formed. Whether the chosen action can actually be built
 * from it is a separate question — see `resolveActionRequirements`, which reads the
 * manifest rather than the request's shape.
 */
export function parseLiquidProcessCtParams(value: unknown): ParsedLiquidProcessCtParams {
	const parsed = processCtParamsSchema.safeParse(value);

	if (!parsed.success) {
		throw new WalletRpcInvalidParamsError(
			"Invalid processConfidentialTransaction parameters.",
			parsed.error.flatten(),
			WALLET_RPC_ERROR_REASONS.INVALID_MANIFEST_REQUEST,
		);
	}

	return parsed.data;
}
