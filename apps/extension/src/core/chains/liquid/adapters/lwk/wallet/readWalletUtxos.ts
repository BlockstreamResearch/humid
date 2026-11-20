import type {
	LiquidBlindingSecrets,
	LiquidUtxoSnapshot,
} from "../../../application/backends/LiquidWalletBackend";
import type { LwkWasmModule } from "../loadLwkWasm";
import { walletTxOut } from "./walletTxOut";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

type LwkTxOutSecrets = {
	asset: () => { toString: () => string };
	assetBlindingFactor: () => { toString: () => string };
	value: () => bigint;
	valueBlindingFactor: () => { toString: () => string };
};

export function readWalletUtxos(wollet: LwkWollet): LiquidUtxoSnapshot[] {
	const transactionHexes = new Map(
		wollet.transactions().map((walletTx) => [walletTx.txid().toString(), walletTx.tx().toString()]),
	);

	const snapshots: LiquidUtxoSnapshot[] = [];

	for (const utxo of wollet.utxos()) {
		const unblinded = utxo.unblinded();
		const outpoint = utxo.outpoint();
		const txid = outpoint.txid().toString();
		const vout = outpoint.vout();
		const txOut = walletTxOut(transactionHexes.get(txid) ?? "", txid, vout);
		const spendable = utxo.height() !== undefined;
		const confidential = txOut.confidential;

		const snapshot: LiquidUtxoSnapshot = {
			address: utxo.address().toString(),
			amountSats: unblinded.value().toString(),
			confidential,
			derivationPath: `${utxo.extInt()}/${utxo.wildcardIndex()}`,
			rawAssetId: unblinded.asset().toString(),
			scriptPubKey: utxo.scriptPubkey().toString(),
			spendable,
			txid,
			txOut: txOut.hex,
			vout,
		};

		if (confidential) {
			snapshot.blindingSecrets = secretsOf(unblinded);
		}

		snapshots.push(snapshot);
	}

	return snapshots;
}

function secretsOf(unblinded: LwkTxOutSecrets): LiquidBlindingSecrets {
	return {
		asset: unblinded.asset().toString(),
		assetBlindingFactor: unblinded.assetBlindingFactor().toString(),
		value: Number(unblinded.value()),
		valueBlindingFactor: unblinded.valueBlindingFactor().toString(),
	};
}
