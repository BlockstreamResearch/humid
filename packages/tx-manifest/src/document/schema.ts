import { z } from "zod";

const written = z.union([z.string(), z.number()]);

const position = z.int({ error: "is not a place in a transaction" });

const leafPiece = z.union([
	z.string(),
	z.object({
		align: z.string().optional(),
		endian: z.string().optional(),
		pad_to: z.number().optional(),
		type: z.string(),
		value: z.string(),
	}),
]);

export const leafSchema = z.object({ payload: z.array(leafPiece), type: z.string() });

const programReference = z.object({
	args: z.record(z.string(), z.string()).optional(),
	compile_params: z.record(z.string(), z.string()).default({}),
	utxo_type: z.string(),
});

const compute = z.object({
	extra_leaves: z.array(leafSchema).default([]),
	params: z
		.record(
			z.string(),
			z.union([z.string(), z.object({ type: z.string().optional(), value: z.string() })]),
		)
		.default({}),
	simf: z.string().optional(),
	simf_hash: z.string().optional(),
	simplicity_hl_version: z.string().optional(),
	type: z.string(),
	wallet: z.string().optional(),
});

const param = z.object({
	compute: z.union([z.string(), compute]).optional(),
	default: written.optional(),
	type: z.string().optional(),
});

const hook = z.object({ set: z.record(z.string(), z.string()) });

const blinding = z.object({ asset_bf: written.optional(), value_bf: written.optional() });

const witness = z.union([
	z.literal("unused"),
	z.object({
		sig_type: z.string().optional(),
		source: z.object({ type: z.string() }).optional(),
		type: z.string(),
		value: z.string().optional(),
	}),
]);

const issuance = z.object({
	asset_amount_sat: written.optional(),
	entropy: z.string().optional(),
	inflation_amount_sat: written.optional(),
	issued_asset: z.string().optional(),
	kind: z.enum(["new", "reissue"]),
});

const input = z.object({
	amount_sat: z.union([written, z.object({ min_amount: written })]).optional(),
	asset: z.string().optional(),
	blinding: blinding.optional(),
	from_address: z.string().optional(),
	id: z.string().optional(),
	issuance: issuance.optional(),
	on_resolved: hook.optional(),
	required_index: position.optional(),
	sequence: z
		.union([
			written,
			z.object({ relative_blocks: written.optional(), relative_seconds: written.optional() }),
		])
		.optional(),
	utxo_source: z.union([z.literal("wallet"), programReference]),
	witnesses: z.record(z.string(), witness).default({}),
});

const destination = z.union([
	z
		.string()
		.transform((text) =>
			text === "change" || text === "wallet"
				? { kind: text as "change" | "wallet" }
				: { address: text, kind: "address" as const },
		),
	programReference.transform((reference) => ({ kind: "program" as const, reference })),
	z.object({ script_hash: z.string() }).transform(({ script_hash }) => ({
		hash: script_hash,
		kind: "script_hash" as const,
	})),
	z
		.object({ type: z.enum(["burn", "fee", "op_return"]) })
		.transform(({ type }) => ({ kind: type })),
]);

const dataPart = z.object({
	align: z.unknown().optional(),
	endian: z.unknown().optional(),
	pad_to: z.unknown().optional(),
	type: z.string(),
	value: z.unknown(),
});

const output = z.object({
	amount_sat: written.optional(),
	asset: z.string().optional(),
	blinding: blinding.optional(),
	confidential: z.boolean().optional(),
	data: z.union([z.string(), z.object({ parts: z.array(dataPart) })]).optional(),
	destination,
	id: z.string().optional(),
	required_index: position.optional(),
});

const action = z.object({
	allow_change: z.enum(["none", "lbtc_only", "any"]).default("none"),
	create_instance: z
		.object({ fields: z.record(z.string(), z.union([z.string(), compute])) })
		.optional(),
	inputs: z.array(input).default([]),
	intent: z.string().optional(),
	on_pre_broadcast: hook.optional(),
	outputs: z.array(output).default([]),
	params: z.record(z.string(), param).default({}),
});

const utxoType = z.object({
	params: z
		.record(z.string(), z.object({ default: z.string().optional(), type: z.string() }))
		.optional(),
	script: z.object({
		compile_params: z.record(z.string(), z.string()).default({}),
		extra_leaves: z.array(leafSchema).default([]),
		simplicity_hl_version: z.string().optional(),
		source: z.string(),
		source_hash: z.string().optional(),
		type: z.string().optional(),
	}),
});

export const manifestSchema = z.object({
	actions: z.record(z.string(), action).default({}),
	contract_templates: z
		.record(
			z.string(),
			z.object({
				actions: z.record(z.string(), action).default({}),
				fields: z.record(z.string(), z.object({ type: z.string().optional() })).default({}),
			}),
		)
		.default({}),
	protocol: z.string().optional(),
	requires: z.array(z.string()).default([]),
	simplicity_hl: z
		.object({
			debug_symbols: z.boolean().default(false),
			unstable_features: z.array(z.enum(["enums", "imports"])).default([]),
			version: z.string().optional(),
		})
		.default({ debug_symbols: false, unstable_features: [] }),
	utxo_types: z.record(z.string(), utxoType).default({}),
});

export type ManifestDocument = z.infer<typeof manifestSchema>;
export type ActionDocument = z.infer<typeof action>;
export type InputDocument = z.infer<typeof input>;
export type OutputDocument = z.infer<typeof output>;
export type ProgramReference = z.infer<typeof programReference>;
export type Destination = z.infer<typeof destination>;
export type Witness = z.infer<typeof witness>;
export type Hook = z.infer<typeof hook>;
export type Compute = z.infer<typeof compute>;
export type Param = z.infer<typeof param>;
export type Blinding = z.infer<typeof blinding>;
export type Issuance = z.infer<typeof issuance>;
export type DataPart = z.infer<typeof dataPart>;
export type Leaf = z.infer<typeof leafSchema>;
export type UtxoType = z.infer<typeof utxoType>;
