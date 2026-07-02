import type { LiquidChainRecord } from "../../chains/LiquidChainRecord";
import type { LwkNetwork } from "./createLwkNetwork";
import type { LwkWasmModule } from "./loadLwkWasm";

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
	const builder = new lwk.EsploraClientBuilder(network, backend.url);

	builder.waterfalls(backend.waterfalls === true);
	builder.utxoOnly(backend.utxoOnly === true);
	builder.concurrency(backend.concurrency ?? 1);

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
