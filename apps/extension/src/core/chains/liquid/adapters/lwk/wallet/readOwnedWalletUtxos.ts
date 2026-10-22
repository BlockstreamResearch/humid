import type { LiquidUtxoSnapshot } from "../../../application/backends/LiquidWalletBackend";
import type { LwkWasmModule } from "../loadLwkWasm";
import { readExplicitWalletUtxos } from "./readExplicitWalletUtxos";
import { readWalletUtxos } from "./readWalletUtxos";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

export function readOwnedWalletUtxos(wollet: LwkWollet): LiquidUtxoSnapshot[] {
	return [...readWalletUtxos(wollet), ...readExplicitWalletUtxos(wollet)];
}
