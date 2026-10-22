import type { LiquidUtxoSnapshot } from "../../../application/backends/LiquidWalletBackend";
import type { LwkWasmModule } from "../loadLwkWasm";
import { readExplicitWalletUtxos } from "./readExplicitWalletUtxos";
import { readWalletUtxos } from "./readWalletUtxos";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

export function readOwnedWalletUtxos(wollet: LwkWollet): LiquidUtxoSnapshot[] {
	return [...readWalletUtxos(wollet), ...readExplicitWalletUtxos(wollet)];
}

export function sumByAsset(utxos: LiquidUtxoSnapshot[]): Map<string, bigint> {
	const balances = new Map<string, bigint>();

	for (const utxo of utxos) {
		balances.set(utxo.rawAssetId, (balances.get(utxo.rawAssetId) ?? 0n) + BigInt(utxo.amountSats));
	}

	return balances;
}
