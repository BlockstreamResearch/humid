import type { LiquidChainRecord } from "../../chains/LiquidChainRecord";
import type { LwkNetwork } from "./createLwkNetwork";
import type { LwkWasmModule } from "./loadLwkWasm";

const DEFAULT_ESPLORA_CONCURRENCY = 2;

export function createLwkBlockchainClient(
	lwk: LwkWasmModule,
	chain: LiquidChainRecord,
	network: LwkNetwork,
): InstanceType<LwkWasmModule["EsploraClient"]> {
	const backend = chain.settings.backend;
	const waterfalls = backend.waterfalls === true;
	const utxoOnly = backend.utxoOnly === true;
	const concurrency = backend.concurrency ?? DEFAULT_ESPLORA_CONCURRENCY;

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
