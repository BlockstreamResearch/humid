import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidWalletAccount } from "../../../../application/backends/LiquidWalletBackend";
import type { LiquidUTXO } from "../../../../domain/LiquidRpc";
import { toLiquidAssetId } from "../../../../domain/validation";
import type { LwkLiquidAccountImplementation } from "../../types";
import { getLwkImplementation } from "../getLwkImplementation";

export function getWalletUtxosForAsset(
	account: LiquidWalletAccount,
	rawAssetId: string,
): LiquidUTXO[] {
	const implementation = getLwkImplementation(account);

	try {
		const txOutByOutpoint = createTxOutLookup(implementation);

		return implementation.wollet.utxos().flatMap((utxo) => {
			const unblinded = utxo.unblinded();
			const utxoRawAssetId = unblinded.asset().toString();

			if (utxoRawAssetId !== rawAssetId) {
				return [];
			}

			const outpoint = utxo.outpoint();
			const txid = outpoint.txid().toString();
			const vout = outpoint.vout();
			const rawTxOut = txOutByOutpoint.get(createOutpointKey(txid, vout));

			if (!rawTxOut) {
				throw new WalletRpcResourceUnavailableError(
					"Could not locate the raw previous output for a wallet UTXO.",
					{ txid, vout },
					WALLET_RPC_ERROR_REASONS.WALLET_UTXO_READ_FAILED,
				);
			}

			return [
				{
					address: utxo.address().toString(),
					amount: unblinded.value().toString(),
					assetId: toLiquidAssetId(account.chainId, utxoRawAssetId),
					confidential: rawTxOut.isPartiallyBlinded(),
					scriptPubKey: utxo.scriptPubkey().toString(),
					spendable: true,
					txid,
					txOut: rawTxOut.toString(),
					vout,
				},
			];
		});
	} catch (error) {
		if (error instanceof WalletRpcResourceUnavailableError) {
			throw error;
		}

		throw new WalletRpcResourceUnavailableError(
			"Could not read Liquid UTXOs from the LWK wallet state.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_UTXO_READ_FAILED,
		);
	}
}

type LwkTxOutView = {
	isPartiallyBlinded: () => boolean;
	toString: () => string;
};

function createTxOutLookup(
	implementation: LwkLiquidAccountImplementation,
): Map<string, LwkTxOutView> {
	const txOutByOutpoint = new Map<string, LwkTxOutView>();

	for (const walletTx of implementation.wollet.transactions()) {
		const txid = walletTx.txid().toString();
		const tx = walletTx.tx();

		for (const [vout, txOut] of tx.outputs.entries()) {
			txOutByOutpoint.set(createOutpointKey(txid, vout), txOut);
		}
	}

	return txOutByOutpoint;
}

function createOutpointKey(txid: string, vout: number): string {
	return `${txid}:${vout}`;
}
