import { z } from "zod";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";

import {
	LIQUID_MAINNET_CHAIN_ID,
	LIQUID_TESTNET_CHAIN_ID,
	type LiquidChainId,
} from "../domain/LiquidChain";

export const LIQUID_CHAIN_GROUP_ID = "liquid";

export const LIQUID_CHAIN_BACKENDS = {
	ESPLORA: "esplora",
	WATERFALLS: "waterfalls",
} as const;

export const LIQUID_NETWORK_KINDS = {
	MAINNET: "mainnet",
	TESTNET: "testnet",
	REGTEST: "regtest",
} as const;

export type LiquidNetworkKind = (typeof LIQUID_NETWORK_KINDS)[keyof typeof LIQUID_NETWORK_KINDS];

export type LiquidHttpHeader = { name: string; value: string };

export type LiquidChainBackend = {
	url: string;
	waterfalls?: boolean;
	utxoOnly?: boolean;
	headers?: LiquidHttpHeader[];
	timeout?: number;
	concurrency?: number;
};

export type LiquidChainSettings = {
	network: LiquidNetworkKind;
	policyAsset?: string;
	backend: LiquidChainBackend;
	explorerUrl?: string;
};

export type LiquidChainRecord = ChainRecord<LiquidChainSettings> & {
	chainGroupId: typeof LIQUID_CHAIN_GROUP_ID;
	id: LiquidChainId;
};

const liquidHttpHeaderSchema = z.object({
	name: z.string(),
	value: z.string(),
});

function migrateLegacyLiquidBackend(value: unknown): unknown {
	if (value && typeof value === "object" && "kind" in value) {
		const { kind, ...rest } = value as Record<string, unknown>;

		return {
			...rest,
			waterfalls: kind === LIQUID_CHAIN_BACKENDS.WATERFALLS || rest.waterfalls === true,
		};
	}

	return value;
}

const liquidChainBackendSchema = z.preprocess(
	migrateLegacyLiquidBackend,
	z.object({
		url: z.string().min(1),
		waterfalls: z.boolean().optional(),
		utxoOnly: z.boolean().optional(),
		headers: z.array(liquidHttpHeaderSchema).optional(),
		timeout: z.number().int().min(0).max(255).optional(),
		concurrency: z.number().int().min(1).optional(),
	}),
);

const liquidChainRecordSchema = z.object({
	chainGroupId: z.literal(LIQUID_CHAIN_GROUP_ID),
	id: z.string().min(1),
	name: z.string().min(1),
	settings: z.object({
		network: z
			.enum([
				LIQUID_NETWORK_KINDS.MAINNET,
				LIQUID_NETWORK_KINDS.TESTNET,
				LIQUID_NETWORK_KINDS.REGTEST,
			])
			.optional(),
		policyAsset: z.string().min(1).optional(),
		backend: liquidChainBackendSchema,
		explorerUrl: z.string().min(1).optional(),
	}),
});

function resolveLiquidNetworkKind(
	chainId: string,
	persisted: LiquidNetworkKind | undefined,
): LiquidNetworkKind {
	if (chainId === LIQUID_MAINNET_CHAIN_ID) return LIQUID_NETWORK_KINDS.MAINNET;
	if (chainId === LIQUID_TESTNET_CHAIN_ID) return LIQUID_NETWORK_KINDS.TESTNET;
	return persisted ?? LIQUID_NETWORK_KINDS.REGTEST;
}

export function parseLiquidChainRecord(value: unknown): LiquidChainRecord {
	const parsed = liquidChainRecordSchema.safeParse(value);

	if (!parsed.success) {
		throw new Error("Vault item does not match the HUMID Liquid chain model.");
	}

	const { settings } = parsed.data;

	return {
		...parsed.data,
		settings: {
			...settings,
			network: resolveLiquidNetworkKind(parsed.data.id, settings.network),
		},
	} as LiquidChainRecord;
}
