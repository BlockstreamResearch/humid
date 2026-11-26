import type { TxOutSecrets } from "lwk_wasm";

import type { LiquidUtxoSnapshot } from "../../../application/backends/LiquidWalletBackend";
import type { LwkWasmModule } from "../loadLwkWasm";
import { readOwnedWalletUtxos } from "./readOwnedWalletUtxos";

type Wollet = InstanceType<LwkWasmModule["Wollet"]>;

export class WalletCoins {
	private readonly byOutpoint: Map<string, LiquidUtxoSnapshot>;

	constructor(coins: LiquidUtxoSnapshot[]) {
		this.byOutpoint = new Map(
			coins
				.filter((coin) => coin.confidential || coin.spendable)
				.map((coin) => [`${coin.txid}:${coin.vout}`, coin]),
		);
	}

	static of(wollet: Wollet): WalletCoins {
		return new WalletCoins(readOwnedWalletUtxos(wollet));
	}

	find(outpoint: string): LiquidUtxoSnapshot | undefined {
		return this.byOutpoint.get(outpoint);
	}

	static secretsOf(lwk: LwkWasmModule, coin: LiquidUtxoSnapshot): TxOutSecrets {
		const asset = lwk.AssetId.fromString(coin.rawAssetId);
		const value = BigInt(coin.amountSats);
		const blinding = coin.blindingSecrets;
		return blinding
			? new lwk.TxOutSecrets(
					asset,
					lwk.AssetBlindingFactor.fromString(blinding.assetBlindingFactor),
					value,
					lwk.ValueBlindingFactor.fromString(blinding.valueBlindingFactor),
				)
			: lwk.TxOutSecrets.fromExplicit(asset, value);
	}
}
