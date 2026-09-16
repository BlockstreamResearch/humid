import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidUtxoSnapshot } from "../../../application/backends/LiquidWalletBackend";
import type { LwkWasmModule } from "../loadLwkWasm";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

const CHAIN_EXTERNAL = 0;

const SIGNING_INDEX = 0;

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

			if (rawTxOut.isPartiallyBlinded()) {
				continue;
			}

			if (owned.extInt() !== CHAIN_EXTERNAL || owned.wildcardIndex() !== SIGNING_INDEX) {
				continue;
			}

			const unblinded = owned.unblinded();

			candidates.set(outpointKey(txid, vout), {
				address: owned.address().toString(),
				amountSats: unblinded.value().toString(),
				confidential: false,
				rawAssetId: unblinded.asset().toString(),
				scriptPubKey: owned.scriptPubkey().toString(),
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
