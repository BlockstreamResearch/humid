import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type {
	LiquidBlindingSecrets,
	LiquidUtxoSnapshot,
} from "../../../application/backends/LiquidWalletBackend";
import type { LwkWasmModule } from "../loadLwkWasm";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

type LwkTxOutSecrets = {
	asset: () => { toString: () => string };
	assetBlindingFactor: () => { toString: () => string };
	value: () => bigint;
	valueBlindingFactor: () => { toString: () => string };
};

type LwkTxOutView = {
	isPartiallyBlinded: () => boolean;
	toString: () => string;
};

export function readWalletUtxos(wollet: LwkWollet): LiquidUtxoSnapshot[] {
	const txOutByOutpoint = createTxOutLookup(wollet);

	const snapshots: LiquidUtxoSnapshot[] = [];

	for (const utxo of wollet.utxos()) {
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
		const confidential = rawTxOut.isPartiallyBlinded();

		const snapshot: LiquidUtxoSnapshot = {
			address: utxo.address().toString(),
			amountSats: unblinded.value().toString(),
			confidential,
			derivationPath: `${utxo.extInt()}/${utxo.wildcardIndex()}`,
			rawAssetId: unblinded.asset().toString(),
			scriptPubKey: utxo.scriptPubkey().toString(),
			spendable,
			txid,
			txOut: rawTxOut.toString(),
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
