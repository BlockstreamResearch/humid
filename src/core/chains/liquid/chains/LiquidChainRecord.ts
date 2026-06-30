import { z } from "zod";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";

import type { LiquidChainId } from "../domain/LiquidChain";

export const LIQUID_CHAIN_GROUP_ID = "liquid";

export const LIQUID_CHAIN_BACKENDS = {
	ESPLORA: "esplora",
	WATERFALLS: "waterfalls",
} as const;

export type LiquidChainBackend =
	| {
			kind: typeof LIQUID_CHAIN_BACKENDS.ESPLORA;
			url: string;
	  }
	| {
			kind: typeof LIQUID_CHAIN_BACKENDS.WATERFALLS;
			url: string;
			utxoOnly?: boolean;
	  };

export type LiquidChainSettings = {
	backend: LiquidChainBackend;
};

export type LiquidChainRecord = ChainRecord<LiquidChainSettings> & {
	chainGroupId: typeof LIQUID_CHAIN_GROUP_ID;
	id: LiquidChainId;
};

const liquidChainBackendSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal(LIQUID_CHAIN_BACKENDS.ESPLORA),
		url: z.string().min(1),
	}),
	z.object({
		kind: z.literal(LIQUID_CHAIN_BACKENDS.WATERFALLS),
		url: z.string().min(1),
		utxoOnly: z.boolean().optional(),
	}),
]);

const liquidChainRecordSchema = z.object({
	chainGroupId: z.literal(LIQUID_CHAIN_GROUP_ID),
	id: z.string().min(1),
	name: z.string().min(1),
	settings: z.object({
		backend: liquidChainBackendSchema,
	}),
});

export function parseLiquidChainRecord(value: unknown): LiquidChainRecord {
	const parsed = liquidChainRecordSchema.safeParse(value);

	if (!parsed.success) {
		throw new Error("Vault item does not match the HUMID Liquid chain model.");
	}

	return parsed.data as LiquidChainRecord;
}
