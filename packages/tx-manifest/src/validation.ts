import { z } from "zod";

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

/** A malformed request, with the field-by-field detail a caller can show or wrap. */
export type MalformedRequest = {
	details: z.core.$ZodFlattenedError<Record<string, unknown>>;
	message: string;
};

export type ParseRequestResult =
	| { ok: false; malformed: MalformedRequest }
	| { ok: true; request: ParsedLiquidProcessCtParams };

/**
 * Checks the request is well-formed. Whether the chosen action can actually be built
 * from it is a separate question — see `resolveActionRequirements`, which reads the
 * manifest rather than the request's shape.
 *
 * A malformed request comes back as a value rather than a thrown transport error: this
 * package has no transport, and the caller that does owns how a refusal reaches whoever
 * asked.
 */
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
