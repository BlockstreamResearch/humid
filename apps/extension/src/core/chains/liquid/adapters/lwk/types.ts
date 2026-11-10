import type { LwkBlockchainClient } from "./createLwkBlockchainClient";
import type { LwkNetwork } from "./createLwkNetwork";
import type { LwkWasmModule } from "./loadLwkWasm";

export type LwkLiquidAccountImplementation = {
	blockchainClient: LwkBlockchainClient;
	network: LwkNetwork;
	signer: InstanceType<LwkWasmModule["Signer"]>;
	wollet: InstanceType<LwkWasmModule["Wollet"]>;
};
