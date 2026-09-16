import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidUtxoSnapshot } from "../../../application/backends/LiquidWalletBackend";
import type { LwkWasmModule } from "../loadLwkWasm";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

type LwkTxOutView = {
	isPartiallyBlinded: () => boolean;
	toString: () => string;
};

export function readWalletUtxos(wollet: LwkWollet): LiquidUtxoSnapshot[] {
	const txOutByOutpoint = createTxOutLookup(wollet);

	return wollet.utxos().map((utxo) => {
		const unblinded = utxo.unblinded();
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

		const spendable = utxo.height() !== undefined;

		return {
			address: utxo.address().toString(),
			amountSats: unblinded.value().toString(),
			confidential: rawTxOut.isPartiallyBlinded(),
			rawAssetId: unblinded.asset().toString(),
			scriptPubKey: utxo.scriptPubkey().toString(),
			spendable,
			txid,
			txOut: rawTxOut.toString(),
			vout,
		} satisfies LiquidUtxoSnapshot;
	});
}

function createTxOutLookup(wollet: LwkWollet): Map<string, LwkTxOutView> {
	const txOutByOutpoint = new Map<string, LwkTxOutView>();

	for (const walletTx of wollet.transactions()) {
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
