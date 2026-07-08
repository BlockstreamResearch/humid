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

/**
 * Every wallet UTXO as a raw snapshot entry (all assets, unfiltered), in base units. This is the
 * SINGLE source of truth for the getUTXOs field mapping: both the dapp `getUTXOs` RPC
 * (`getUTXOs/index.ts`, which filters by asset and adds the CAIP `assetId`) and the portfolio
 * snapshot scan (`liquidScanCore.scanAndRead`) read UTXOs through here, so the two never drift.
 *
 * Each entry pairs the wollet's unspent output with the raw previous `TxOut` looked up from the
 * wallet's own transaction history — the confidential flag and serialized `txOut` come from there.
 * A UTXO with no locatable prev-output is a wallet-state integrity failure (effectively unreachable,
 * since a wallet UTXO's creating tx is always wallet-relevant), surfaced as a resource error.
 *
 * Worker-safe: depends only on the lwk wasm types and the dependency-free wallet-rpc error module,
 * so it imports cleanly into both the sync worker bundle and the service-worker context.
 */
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

		// ELIP-1 `spendable` = "whether the wallet considers the UTXO spendable under wallet policy".
		// LWK's `WalletTxOut` exposes no explicit spendable/maturity flag, so the only real per-UTXO
		// policy signal is confirmation status: `height()` is the block height, or `undefined` while
		// the output is still unconfirmed ("Return the height of the block containing this output if
		// it's confirmed."). This wallet is a plain BIP-84 wpkh singlesig descriptor — no timelocks or
		// custom scripts, and Liquid has no coinbase maturity for user wallets — so confirmation is the
		// only meaningful policy dimension. We take the conservative, dapp-safe reading: an owned,
		// confirmed UTXO is spendable; an unconfirmed (mempool, still RBF-replaceable) one is not. The
		// permissive self-send/RBF reading — treating one's own unconfirmed change as spendable (a
		// constant `true`) — is the defensible alternative.
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
