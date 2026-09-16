import { z } from "zod";

import type { ParsedLiquidProcessCtParams } from "./request";

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

export type MalformedRequest = {
	details: z.core.$ZodFlattenedError<Record<string, unknown>>;
	message: string;
};

export type ParseRequestResult =
	| { ok: false; malformed: MalformedRequest }
	| { ok: true; request: ParsedLiquidProcessCtParams };

export function parseLiquidProcessCtParams(value: unknown): ParseRequestResult {
	const parsed = processCtParamsSchema.safeParse(value);

	return parsed.success
		? { ok: true, request: parsed.data }
		: {
				malformed: {
					details: z.flattenError(parsed.error),
					message: "Invalid processConfidentialTransaction parameters.",
				},
				ok: false,
			};
}
