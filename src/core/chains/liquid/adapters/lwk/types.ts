import type { LwkNetwork } from "./createLwkNetwork";
import type { LwkWasmModule } from "./loadLwkWasm";

export type LwkLiquidAccountImplementation = {
	blockchainClient: InstanceType<LwkWasmModule["EsploraClient"]>;
	network: LwkNetwork;
	signer: InstanceType<LwkWasmModule["Signer"]>;
	wollet: InstanceType<LwkWasmModule["Wollet"]>;
};
