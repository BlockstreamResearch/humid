import { LIQUID_CHAIN_BACKENDS, type LiquidChainRecord } from "../../chains/LiquidChainRecord";
import type { LwkNetwork } from "./createLwkNetwork";
import type { LwkWasmModule } from "./loadLwkWasm";

export function createLwkBlockchainClient(
	lwk: LwkWasmModule,
	chain: LiquidChainRecord,
	network: LwkNetwork,
): InstanceType<LwkWasmModule["EsploraClient"]> {
	const backend = chain.settings.backend;

	return new lwk.EsploraClient(
		network,
		backend.url,
		backend.kind === LIQUID_CHAIN_BACKENDS.WATERFALLS,
		1,
		backend.kind === LIQUID_CHAIN_BACKENDS.WATERFALLS && Boolean(backend.utxoOnly),
	);
}
