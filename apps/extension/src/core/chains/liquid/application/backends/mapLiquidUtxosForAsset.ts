import { parseTxOut } from "@humid/tx-manifest";

import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

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

		const txOut = parseTxOut(utxo.txOut);

		if (!txOut) {
			throw new WalletRpcResourceUnavailableError(
				"Could not read a wallet UTXO's output.",
				{ txid: utxo.txid, vout: utxo.vout },
				WALLET_RPC_ERROR_REASONS.WALLET_UTXO_READ_FAILED,
			);
		}

		return [
			{
				address: utxo.address,
				amount: utxo.amountSats,
				assetId: requestedAsset.assetId,
				commitments: txOut.commitments,
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
