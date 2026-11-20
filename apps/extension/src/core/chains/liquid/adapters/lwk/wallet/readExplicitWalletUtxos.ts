import type { LiquidUtxoSnapshot } from "../../../application/backends/LiquidWalletBackend";
import type { LwkWasmModule } from "../loadLwkWasm";
import { walletTxOut } from "./walletTxOut";

type LwkWollet = InstanceType<LwkWasmModule["Wollet"]>;

const CHAIN_EXTERNAL = 0;

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
		const transactionHex = walletTx.tx().toString();

		for (const output of walletTx.outputs()) {
			const owned = output.get();

			if (!owned) {
				continue;
			}

			const outpoint = owned.outpoint();
			const vout = outpoint.vout();
			const txOut = walletTxOut(transactionHex, txid, vout);

			if (txOut.confidential) {
				continue;
			}

			const chain = owned.extInt();
			const index = owned.wildcardIndex();
			const unblinded = owned.unblinded();

			candidates.set(outpointKey(txid, vout), {
				address:
					chain === CHAIN_EXTERNAL
						? wollet.address(index).address().toString()
						: owned.address().toString(),
				amountSats: unblinded.value().toString(),
				confidential: false,
				derivationPath: `${chain}/${index}`,
				rawAssetId: unblinded.asset().toString(),
				scriptPubKey: owned.scriptPubkey().toString(),
				spendable: owned.height() !== undefined,
				txid,
				txOut: txOut.hex,
				vout,
			} satisfies LiquidUtxoSnapshot);
		}
	}

	return [...candidates].filter(([key]) => !spent.has(key)).map(([, utxo]) => utxo);
}

function outpointKey(txid: string, vout: number): string {
	return `${txid}:${vout}`;
}
