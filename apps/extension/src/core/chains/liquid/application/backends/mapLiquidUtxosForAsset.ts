import type { LiquidAssetId } from "../../domain/LiquidAsset";
import type { LiquidUTXO } from "../../domain/LiquidRpc";
import type { LiquidUtxoSnapshot } from "./LiquidWalletBackend";

export function mapLiquidUtxosForAsset(
	utxos: readonly LiquidUtxoSnapshot[],
	requestedAsset: { assetId: LiquidAssetId; rawAssetId: string },
): LiquidUTXO[] {
	return utxos.flatMap((utxo) => {
		if (utxo.rawAssetId !== requestedAsset.rawAssetId) {
			return [];
		}

		return [
			{
				address: utxo.address,
				amount: utxo.amountSats,
				assetId: requestedAsset.assetId,
				confidential: utxo.confidential,
				scriptPubKey: utxo.scriptPubKey,
				spendable: utxo.spendable,
				txid: utxo.txid,
				txOut: utxo.txOut,
				vout: utxo.vout,
			},
		];
	});
}
