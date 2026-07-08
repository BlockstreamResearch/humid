import type { LiquidAssetId } from "../../domain/LiquidAsset";
import type { LiquidUTXO } from "../../domain/LiquidRpc";
import type { LiquidUtxoSnapshot } from "./LiquidWalletBackend";

/**
 * The single filter+shape mapping from a raw wallet UTXO set to the ELIP-1 `getUTXOs` result
 * entries: keep only the requested asset's UTXOs and stamp each with the CAIP `assetId`. Shared by
 * the live LWK scan path (adapter `getWalletUtxosForAsset`, which reads `readWalletUtxos`) and the
 * snapshot serve path (the `getUTXOs` method, which reads the persisted snapshot's `utxos`), so a
 * dapp gets byte-identical UTXOs whether served live or from the cached snapshot. The snapshot
 * `PortfolioUtxo` and `LiquidUtxoSnapshot` are structurally identical, so a snapshot's `utxos` pass
 * straight in. The caller supplies the requested asset's raw id and its CAIP `assetId` (both refer to
 * the same asset), so this stays a pure array transform with no id formatting of its own.
 */
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
