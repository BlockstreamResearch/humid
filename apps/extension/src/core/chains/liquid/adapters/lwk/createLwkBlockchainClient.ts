import type { LiquidChainRecord } from "../../chains/LiquidChainRecord";
import type { LwkNetwork } from "./createLwkNetwork";
import type { LwkWasmModule } from "./loadLwkWasm";

// LWK defaults Esplora request concurrency to 1 — fully sequential. In a browser that makes a
// cold full scan crawl: dozens of address-history requests fired one at a time (and repeated on
// every incremental scan too, since it re-queries the address set). Fan them out; a public
// esplora handles this fine and it cuts a cold scan from ~a minute to a few seconds. Per-chain
// backend settings can still override it.
const DEFAULT_ESPLORA_CONCURRENCY = 8;

/**
 * Build the LWK Esplora client for a chain's backend settings via the
 * `EsploraClientBuilder`: URL + Waterfalls flag, request tuning and any custom
 * headers (used to authenticate against servers that require an API key).
 */
export function createLwkBlockchainClient(
	lwk: LwkWasmModule,
	chain: LiquidChainRecord,
	network: LwkNetwork,
): InstanceType<LwkWasmModule["EsploraClient"]> {
	const backend = chain.settings.backend;
	const waterfalls = backend.waterfalls === true;
	const utxoOnly = backend.utxoOnly === true;
	const concurrency = backend.concurrency ?? DEFAULT_ESPLORA_CONCURRENCY;

	// Trace the effective backend the scan actually runs against — confirms which URL, whether
	// waterfalls is on, and the request concurrency (a low value is what makes a scan crawl).
	console.warn("[liquid-sync] esplora backend", {
		chainId: chain.id,
		concurrency,
		headers: (backend.headers ?? []).length,
		timeout: backend.timeout ?? null,
		url: backend.url,
		utxoOnly,
		waterfalls,
	});

	const builder = new lwk.EsploraClientBuilder(network, backend.url);

	builder.waterfalls(waterfalls);
	builder.utxoOnly(utxoOnly);
	builder.concurrency(concurrency);

	if (backend.timeout !== undefined) {
		builder.timeout(backend.timeout);
	}

	for (const header of backend.headers ?? []) {
		if (header.name) {
			builder.header(header.name, header.value);
		}
	}

	const client = builder.build();
	builder.free();

	return client;
}
