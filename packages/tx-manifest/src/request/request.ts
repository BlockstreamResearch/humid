import { z } from "zod";

const outpoint = z.object({ txid: z.string(), vout: z.int().nonnegative() });

const instanceFile = z.object({
	instance: z
		.object({
			fields: z.record(z.string(), z.unknown()).optional(),
			template: z.string().optional(),
		})
		.optional(),
	provided_inputs: z.record(z.string(), outpoint).optional(),
});

const stateFile = z.object({
	utxos: z
		.array(outpoint.extend({ asset: z.string().optional(), utxo_type: z.string() }))
		.optional(),
});

const processCtParamsSchema = z
	.object({
		action: z.string().min(1).max(256),
		broadcast: z.boolean().optional().default(false),
		contractSources: z.record(z.string().min(1), z.string().min(1).max(1_000_000)),
		instance: instanceFile.optional(),
		manifest: z.record(z.string(), z.unknown()),
		params: z.record(z.string(), z.unknown()).optional().default({}),
		state: stateFile.optional(),
	})
	.strict();

export type ParsedLiquidProcessCtParams = z.output<typeof processCtParamsSchema>;
export type InstanceFile = z.output<typeof instanceFile>;
export type StateFile = z.output<typeof stateFile>;

export type RequestPart = "contractSources" | "instance" | "params" | "state";

export type MissingPart = {
	keys?: string[];
	part: RequestPart;
	reason: string;
};

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
