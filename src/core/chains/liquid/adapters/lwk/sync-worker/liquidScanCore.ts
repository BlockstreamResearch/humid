import type { LiquidActivityEntry } from "../../../application/backends/LiquidWalletBackend";
import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { createLwkBlockchainClient } from "../createLwkBlockchainClient";
import { createLwkNetwork } from "../createLwkNetwork";
import { loadLwkWasm, type LwkWasmModule } from "../loadLwkWasm";
import { readWalletActivityForAsset, readWalletBalanceForAsset } from "../wallet/readWalletData";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

/** The inputs shared by both scan operations; `id` correlates a scan across the trace logs. */
export type LiquidScanInput = {
	chain: LiquidChainRecord;
	descriptor: string;
	id: number;
};

export type LiquidScanAndReadResult = {
	activity: LiquidActivityEntry[];
	balance: string;
	rawPolicyAssetId: string;
};

// Cached wollets accumulate scan deltas so repeat scans stay incremental while this context is
// alive. Keyed by chain + descriptor (a wollet is bound to its network and descriptor).
const wolletCache = new Map<string, LwkWollet>();

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
export async function scanAndRead(input: LiquidScanInput): Promise<LiquidScanAndReadResult> {
	const lwk = await loadLwkWasm();
	const network = createLwkNetwork(lwk, input.chain);
	// Include the policy asset: it (with the id) defines the wollet's network, so editing a
	// custom chain's policy asset must scan a fresh wollet rather than the cached one.
	const cacheKey = `${input.chain.id}:${input.chain.settings.policyAsset ?? ""}:${input.descriptor}`;

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
	const balance = readWalletBalanceForAsset(wollet, input.chain.id, rawPolicyAssetId);
	const activity = readWalletActivityForAsset(wollet, rawPolicyAssetId);

	console.warn("[liquid-sync] scanAndRead done", {
		activityCount: activity.length,
		balance,
		id: input.id,
		ms: Date.now() - scanStartedAt,
	});

	return { activity, balance, rawPolicyAssetId };
}
