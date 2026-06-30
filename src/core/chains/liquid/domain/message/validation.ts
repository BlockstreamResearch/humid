import { z } from "zod";

import { WALLET_RPC_ERROR_REASONS, WalletRpcInvalidParamsError } from "@/core/wallet-rpc/errors";

import { LIQUID_SIGN_MESSAGE_PROTOCOLS, type ParsedLiquidSignMessageParams } from "./types";

const liquidSignMessageParamsSchema = z
	.object({
		address: z.string().min(1).max(4096),
		message: z.string().min(1).max(65536),
		protocol: z
			.enum([LIQUID_SIGN_MESSAGE_PROTOCOLS.ECDSA, LIQUID_SIGN_MESSAGE_PROTOCOLS.BIP322])
			.optional()
			.default(LIQUID_SIGN_MESSAGE_PROTOCOLS.ECDSA),
	})
	.strict();

export function parseLiquidSignMessageParams(value: unknown): ParsedLiquidSignMessageParams {
	const parsed = liquidSignMessageParamsSchema.safeParse(value);

	if (!parsed.success) {
		throw new WalletRpcInvalidParamsError(
			"Invalid signMessage parameters.",
			parsed.error.flatten(),
			WALLET_RPC_ERROR_REASONS.INVALID_MESSAGE_SIGNING_REQUEST,
		);
	}

	return parsed.data;
}
