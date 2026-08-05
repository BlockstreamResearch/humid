import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidUtxoSnapshot } from "../../../application/backends/LiquidWalletBackend";
import type { LwkWasmModule } from "../loadLwkWasm";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

/**
 * The wallet's own unspent outputs that hide nothing.
 *
 * `Wollet::utxos` cannot answer this. It walks the unspent cache and then skips every entry
 * whose amount is explicit, so an unblinded output at one of the wallet's own scripts is never
 * listed — the library states the same rule in its own words, that "unblinded UTXOs with the
 * same scriptpubkeys as the wallet, are considered external". The output is in the cache; only
 * the listing drops it.
 *
 * That matters because a contract action can spend nothing else. Unblinding an output needs the
 * secrets that go with it, and the signing module is handed an outpoint and its bytes and
 * nothing more — so the money a person can put behind a contract is exactly the money that is
 * already in the open. Without this the wallet cannot see what it sent itself.
 *
 * Built from the wallet's own transactions rather than from a second source: each one reports
 * which of its outputs belong to the wallet and which of its inputs spent wallet outputs, so
 * what is unspent is the difference. No network call, and nothing is treated as the wallet's
 * that the wallet's own scan did not already claim.
 */
export function readExplicitWalletUtxos(wollet: LwkWollet): LiquidUtxoSnapshot[] {
	const spent = new Set<string>();
	const candidates = new Map<string, LiquidUtxoSnapshot>();

	for (const walletTx of wollet.transactions()) {
		for (const input of walletTx.inputs()) {
			const previous = input.get();

			if (!previous) {
				continue;
			}

			const outpoint = previous.outpoint();

			spent.add(outpointKey(outpoint.txid().toString(), outpoint.vout()));
		}

		const txid = walletTx.txid().toString();
		const rawOutputs = walletTx.tx().outputs;

		for (const output of walletTx.outputs()) {
			const owned = output.get();

			if (!owned) {
				continue;
			}

			const outpoint = owned.outpoint();
			const vout = outpoint.vout();
			const rawTxOut = rawOutputs[vout];

			if (!rawTxOut) {
				throw new WalletRpcResourceUnavailableError(
					"Could not locate the raw output for a wallet transaction output.",
					{ txid, vout },
					WALLET_RPC_ERROR_REASONS.WALLET_UTXO_READ_FAILED,
				);
			}

			// The only ones this reader is for. A blinded output is already reported by the
			// ordinary read, and reporting it twice would have the wallet count it twice.
			if (rawTxOut.isPartiallyBlinded()) {
				continue;
			}

			const unblinded = owned.unblinded();

			candidates.set(outpointKey(txid, vout), {
				address: owned.address().toString(),
				amountSats: unblinded.value().toString(),
				confidential: false,
				rawAssetId: unblinded.asset().toString(),
				scriptPubKey: owned.scriptPubkey().toString(),
				// The same conservative reading the ordinary read takes: confirmed is spendable,
				// still in the mempool is not.
				spendable: owned.height() !== undefined,
				txid,
				txOut: rawTxOut.toString(),
				vout,
			} satisfies LiquidUtxoSnapshot);
		}
	}

	return [...candidates].filter(([key]) => !spent.has(key)).map(([, utxo]) => utxo);
}

function outpointKey(txid: string, vout: number): string {
	return `${txid}:${vout}`;
}
