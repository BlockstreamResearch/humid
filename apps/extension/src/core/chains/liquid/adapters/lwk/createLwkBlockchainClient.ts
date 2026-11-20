import type { LiquidChainRecord } from "../../chains/LiquidChainRecord";
import type { LwkNetwork } from "./createLwkNetwork";
import type { LwkWasmModule } from "./loadLwkWasm";

const DEFAULT_ESPLORA_CONCURRENCY = 2;

export type LwkBlockchainClient =
	| InstanceType<LwkWasmModule["EsploraClient"]>
	| InstanceType<LwkWasmModule["WaterfallsClient"]>;

interface ClientBuilder<Builder, Client> {
	build(): Client;
	concurrency(concurrency: number): Builder;
	header(key: string, value: string): Builder;
	timeout(timeout: number): Builder;
}

export function createLwkBlockchainClient(
	lwk: LwkWasmModule,
	chain: LiquidChainRecord,
	network: LwkNetwork,
): LwkBlockchainClient {
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

	return waterfalls
		? configure(new lwk.WaterfallsClientBuilder(network, backend.url).utxoOnly(utxoOnly))
		: configure(new lwk.EsploraClientBuilder(network, backend.url));

	function configure<Builder extends ClientBuilder<Builder, Client>, Client>(
		initial: Builder,
	): Client {
		// Esplora lets browsers cache address histories for 10 seconds, long enough to offer a coin just spent.
		let builder = initial.concurrency(concurrency).header("Cache-Control", "no-cache");

		if (backend.timeout !== undefined) builder = builder.timeout(backend.timeout);

		for (const header of backend.headers ?? []) {
			if (header.name) builder = builder.header(header.name, header.value);
		}

		return builder.build();
	}
}
