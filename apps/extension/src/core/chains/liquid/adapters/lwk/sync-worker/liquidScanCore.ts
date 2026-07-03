import type {
	LiquidActivityPage,
	LiquidAssetBalance,
	LiquidWalletSnapshot,
} from "../../../application/backends/LiquidWalletBackend";
import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { LIQUID_NATIVE_ASSET } from "../../../domain/LiquidAsset";
import { createLwkBlockchainClient } from "../createLwkBlockchainClient";
import { createLwkNetwork, type LwkNetwork } from "../createLwkNetwork";
import { loadLwkWasm, type LwkWasmModule } from "../loadLwkWasm";
import { readWalletActivityForAsset, readWalletAssetBalances } from "../wallet/readWalletData";
import { type AssetMetadata, resolveIssuedAssetMetadata } from "../wallet/resolveAssetMetadata";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

/** The inputs shared by both scan operations; `id` correlates a scan across the trace logs. */
export type LiquidScanInput = {
	chain: LiquidChainRecord;
	descriptor: string;
	id: number;
};

/** Inputs to read one asset's activity page from the wollet a prior scan cached. */
export type LiquidReadActivityInput = LiquidScanInput & {
	cursor: string | null;
	limit: number;
	rawAssetId: string;
};

/** Issued assets get 8 decimals until the registry pass provides their real precision. */
const DEFAULT_ISSUED_ASSET_DECIMALS = 8;

// Cached wollets accumulate scan deltas so repeat scans stay incremental while this context is
// alive. Keyed by chain + descriptor (a wollet is bound to its network and descriptor).
const wolletCache = new Map<string, LwkWollet>();

/**
 * A wollet is bound to its network (chain id + policy asset) and descriptor, so key the cache by
 * those. Editing a custom chain's policy asset changes the network, so it keys a fresh wollet.
 */
function wolletCacheKey(input: { chain: LiquidChainRecord; descriptor: string }): string {
	return `${input.chain.id}:${input.chain.settings.policyAsset ?? ""}:${input.descriptor}`;
}

/** One-off full scan on a fresh wollet; returns the serialized Update for the caller to apply. */
export async function scanFresh(input: LiquidScanInput): Promise<Uint8Array | null> {
	const lwk = await loadLwkWasm();
	const network = createLwkNetwork(lwk, input.chain);
	const wollet = new lwk.Wollet(network, new lwk.WolletDescriptor(input.descriptor));
	const client = createLwkBlockchainClient(lwk, input.chain, network);

	console.warn("[liquid-sync] scan (fresh) fullScan…", { chainId: input.chain.id, id: input.id });
	const scanStartedAt = Date.now();
	const update = await client.fullScan(wollet);

	console.warn("[liquid-sync] scan (fresh) done", {
		hasUpdate: Boolean(update),
		id: input.id,
		ms: Date.now() - scanStartedAt,
	});

	const updateBytes = update ? update.serialize() : null;

	// Free the per-scan wasm objects (client, update, and the throwaway wollet) so repeated
	// scans don't leak wasm heap. Only scanAndRead's cached wollet is deliberately kept alive.
	update?.free();
	client.free();
	wollet.free();

	return updateBytes;
}

/** Incremental scan on a cached wollet; reads balance and activity directly from it. */
export async function scanAndRead(input: LiquidScanInput): Promise<LiquidWalletSnapshot> {
	const lwk = await loadLwkWasm();
	const network = createLwkNetwork(lwk, input.chain);
	const cacheKey = wolletCacheKey(input);

	let wollet = wolletCache.get(cacheKey);

	console.warn("[liquid-sync] scanAndRead start", {
		cachedWollet: Boolean(wollet),
		chainId: input.chain.id,
		id: input.id,
	});

	if (!wollet) {
		wollet = new lwk.Wollet(network, new lwk.WolletDescriptor(input.descriptor));
		wolletCache.set(cacheKey, wollet);
	}

	// A fresh client each time picks up backend-setting changes; the wollet is reused.
	const client = createLwkBlockchainClient(lwk, input.chain, network);

	console.warn("[liquid-sync] fullScan…", { id: input.id });
	const scanStartedAt = Date.now();
	const update = await client.fullScan(wollet);

	console.warn("[liquid-sync] fullScan done", {
		hasUpdate: Boolean(update),
		id: input.id,
		ms: Date.now() - scanStartedAt,
	});

	if (update) wollet.applyUpdate(update);

	// Free the per-scan wasm objects; the cached wollet is intentionally kept for the next scan.
	update?.free();
	client.free();

	const rawPolicyAssetId = network.policyAsset().toString();
	// Asset metadata is best-effort and off the balance read, so a slow registry doesn't hold up
	// the numbers. Activity is not read here: it's fetched per-asset on demand via `readActivity`.
	const assets = await buildAssetBalances(
		lwk,
		network,
		wollet,
		readWalletAssetBalances(wollet),
		rawPolicyAssetId,
	);

	console.warn("[liquid-sync] scanAndRead done", {
		assetCount: assets.length,
		id: input.id,
		ms: Date.now() - scanStartedAt,
	});

	return { assets };
}

/**
 * Read one asset's transaction history from the wollet a prior `scanAndRead` cached, as an
 * offset-paginated page (newest first). A pure read — it never scans; before the first sync
 * (no cached wollet yet) it returns an empty page, and the portfolio poll's scan populates the
 * wollet for the next call. The offset crosses the boundary as an opaque cursor string.
 */
export function readActivity(input: LiquidReadActivityInput): LiquidActivityPage {
	const wollet = wolletCache.get(wolletCacheKey(input));

	if (!wollet) return { items: [], nextCursor: null };

	const all = readWalletActivityForAsset(wollet, input.rawAssetId);
	const offset = parseActivityCursor(input.cursor);
	const items = all.slice(offset, offset + input.limit);
	const nextOffset = offset + items.length;

	return { items, nextCursor: nextOffset < all.length ? String(nextOffset) : null };
}

/** Parse the opaque activity cursor (a non-negative offset); anything invalid restarts from 0. */
function parseActivityCursor(cursor: string | null): number {
	if (cursor === null) return 0;

	const parsed = Number.parseInt(cursor, 10);

	return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Attach display metadata to raw balances: the native (policy) asset from the known chain
 * asset, issued assets as short placeholders until the registry pass. The native asset is
 * always present (at zero if the wallet holds none) and leads the list.
 */
async function buildAssetBalances(
	lwk: LwkWasmModule,
	network: LwkNetwork,
	wollet: LwkWollet,
	balances: Map<string, bigint>,
	rawPolicyAssetId: string,
): Promise<LiquidAssetBalance[]> {
	const issuedRawAssetIds = [...balances.keys()].filter(
		(rawAssetId) => rawAssetId !== rawPolicyAssetId,
	);
	const metadata = await resolveIssuedAssetMetadata(lwk, network, wollet, issuedRawAssetIds);

	const assets = [...balances].map(([rawAssetId, sats]) =>
		toAssetBalance(rawAssetId, sats, rawPolicyAssetId, metadata.get(rawAssetId)),
	);

	if (!assets.some((asset) => asset.isNative)) {
		assets.push(toAssetBalance(rawPolicyAssetId, 0n, rawPolicyAssetId, undefined));
	}

	// Native first, then by descending balance so the largest holdings lead.
	return assets.toSorted((a, b) => {
		if (a.isNative !== b.isNative) return a.isNative ? -1 : 1;

		const diff = BigInt(b.amountSats) - BigInt(a.amountSats);

		return diff > 0n ? 1 : diff < 0n ? -1 : 0;
	});
}

function toAssetBalance(
	rawAssetId: string,
	sats: bigint,
	rawPolicyAssetId: string,
	metadata: AssetMetadata | undefined,
): LiquidAssetBalance {
	const isNative = rawAssetId === rawPolicyAssetId;
	const label = `${rawAssetId.slice(0, 4)}…${rawAssetId.slice(-4)}`;

	if (isNative) {
		return {
			amountSats: sats.toString(),
			decimals: LIQUID_NATIVE_ASSET.decimals,
			isNative,
			metadata: { isNative },
			name: LIQUID_NATIVE_ASSET.name,
			rawAssetId,
			symbol: LIQUID_NATIVE_ASSET.symbol,
		};
	}

	return {
		amountSats: sats.toString(),
		decimals: metadata?.decimals ?? DEFAULT_ISSUED_ASSET_DECIMALS,
		isNative,
		metadata: { isNative },
		name: metadata?.name ?? label,
		rawAssetId,
		symbol: metadata?.symbol ?? label,
	};
}
