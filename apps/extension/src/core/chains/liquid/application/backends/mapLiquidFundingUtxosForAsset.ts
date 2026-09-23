import type { LiquidAssetId } from "../../domain/LiquidAsset";
import type { LiquidFundingUtxo, LiquidUtxoSnapshot } from "./LiquidWalletBackend";
import { mapLiquidUtxosForAsset } from "./mapLiquidUtxosForAsset";

export function mapLiquidFundingUtxosForAsset(
	utxos: readonly LiquidUtxoSnapshot[],
	requestedAsset: { assetId: LiquidAssetId; rawAssetId: string },
): LiquidFundingUtxo[] {
	const byOutpoint = new Map(utxos.map((utxo) => [`${utxo.txid}:${utxo.vout}`, utxo]));

	const funding: LiquidFundingUtxo[] = [];

	for (const utxo of mapLiquidUtxosForAsset(utxos, requestedAsset)) {
		const snapshot = byOutpoint.get(`${utxo.txid}:${utxo.vout}`);
		const held: LiquidFundingUtxo = utxo;

		if (snapshot?.blindingSecrets) {
			held.blindingSecrets = snapshot.blindingSecrets;
		}

		if (snapshot?.derivationPath) {
			held.derivationPath = snapshot.derivationPath;
		}

		funding.push(held);
	}

	return funding;
}
