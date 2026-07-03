import { z } from "zod";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";

import {
	LIQUID_MAINNET_CHAIN_ID,
	LIQUID_TESTNET_CHAIN_ID,
	type LiquidChainId,
} from "../domain/LiquidChain";

export const LIQUID_CHAIN_GROUP_ID = "liquid";

/**
 * The two Esplora backend modes, used as UI selector values. The model itself
 * carries a `waterfalls` boolean (LWK models Waterfalls as a flag on the same
 * Esplora client), not a discriminant.
 */
export const LIQUID_CHAIN_BACKENDS = {
	ESPLORA: "esplora",
	WATERFALLS: "waterfalls",
} as const;

/**
 * Which Liquid/Elements network a chain targets. Selects the LWK `Network`
 * (`mainnet` / `testnet` / `regtest`) and, with it, the policy asset and address
 * parameters. `regtest` is any custom Elements network (e.g. a local node).
 */
export const LIQUID_NETWORK_KINDS = {
	MAINNET: "mainnet",
	TESTNET: "testnet",
	REGTEST: "regtest",
} as const;

export type LiquidNetworkKind = (typeof LIQUID_NETWORK_KINDS)[keyof typeof LIQUID_NETWORK_KINDS];

/** An extra HTTP header sent on every backend request (e.g. an API key). */
export type LiquidHttpHeader = { name: string; value: string };

/**
 * Blockchain backend configuration. Maps onto the LWK `EsploraClientBuilder`:
 * one URL plus the Waterfalls flag, request tuning, and custom headers used for
 * authenticated servers.
 */
export type LiquidChainBackend = {
	/** Esplora HTTP API base URL (the server may also support the Waterfalls endpoint). */
	url: string;
	/** Use the Waterfalls descriptor endpoint for a faster scan on supporting servers. */
	waterfalls?: boolean;
	/** Only fetch transactions with unspent outputs: faster, but without full history. */
	utxoOnly?: boolean;
	/** Extra HTTP headers sent on every request (e.g. `Authorization` / `x-api-key`). */
	headers?: LiquidHttpHeader[];
	/** Per-request timeout in seconds. */
	timeout?: number;
	/** Concurrent requests during a scan (default 1). */
	concurrency?: number;
};

export type LiquidChainSettings = {
	/** The Liquid/Elements network this chain targets. */
	network: LiquidNetworkKind;
	/** L-BTC policy asset id; required for `regtest` (custom Elements), ignored otherwise. */
	policyAsset?: string;
	/** Blockchain backend: the Esplora HTTP API, optionally the Waterfalls endpoint. */
	backend: LiquidChainBackend;
	/** Block explorer base URL for "view on explorer" links; not passed to LWK. */
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

// Records persisted before the flat backend model used a discriminated union
// (`{ kind: "esplora" | "waterfalls"; url; utxoOnly? }`). Fold the legacy `kind`
// into the `waterfalls` flag so old overrides still load.
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

// `network` is optional in the schema (not in the type) so chain records persisted
// before it existed still load — `parseLiquidChainRecord` backfills it from the id.
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

// A built-in chain's network is defined by its id — force it here, so an edited
// or otherwise stale persisted value can never desync a built-in from its id.
// Custom chains keep their stored kind (defaulting to regtest).
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
