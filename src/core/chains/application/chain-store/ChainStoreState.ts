import { z } from "zod";

import type { ChainGroupId, ChainId, ChainRecord } from "../ChainRecord";

export const CHAIN_STORE_VERSION = 1;

export type ChainStoreState = {
	chains: Record<ChainId, ChainRecord>;
	selectedChainIds: Record<ChainGroupId, ChainId>;
	updatedAt: number;
	version: typeof CHAIN_STORE_VERSION;
};

const chainIdSchema = z.string().min(1);
const chainRecordSchema = z.object({
	chainGroupId: z.string().min(1),
	id: chainIdSchema,
	name: z.string().min(1),
	settings: z.record(z.string(), z.unknown()),
});

const chainStoreStateSchema = z.object({
	chains: z.record(chainIdSchema, chainRecordSchema),
	selectedChainIds: z.record(z.string().min(1), chainIdSchema),
	updatedAt: z.number().finite(),
	version: z.literal(CHAIN_STORE_VERSION),
});

export function createEmptyChainStoreState(createdAt = Date.now()): ChainStoreState {
	return {
		chains: {},
		selectedChainIds: {},
		updatedAt: createdAt,
		version: CHAIN_STORE_VERSION,
	};
}

export function parseChainStoreState(value: unknown): ChainStoreState {
	const parsed = chainStoreStateSchema.safeParse(value);

	if (!parsed.success) {
		throw new Error("Vault item does not match the HUMID chain store model.");
	}

	return parsed.data as ChainStoreState;
}
