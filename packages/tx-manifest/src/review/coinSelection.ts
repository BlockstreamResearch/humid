import { byOutpoint } from "../chain/outpoint";
import { Refusal } from "../refusal";

export type SelectableUtxo = {
	amount: string;
	blindingSecretsJson?: string;
	confidential?: boolean;
	derivationPath?: string;
	scriptPubKeyHex?: string;
	spendable: boolean;
	txOut: string;
	txid: string;
	vout: number;
};

export type CoinSelection = { selected: SelectableUtxo[]; totalSats: bigint };

export function selectCoins(available: SelectableUtxo[], needed: bigint): CoinSelection {
	if (needed <= 0n) {
		throw new Refusal("Nothing to fund.", "shortfall");
	}

	const spendable = byOutpoint(available.filter((utxo) => utxo.spendable)).toSorted(byLargestFirst);

	const selected: SelectableUtxo[] = [];
	let totalSats = 0n;

	for (const utxo of spendable) {
		if (totalSats >= needed) {
			break;
		}

		selected.push(utxo);
		totalSats += toSats(utxo.amount);
	}

	if (totalSats < needed) {
		throw new Refusal(
			`This account holds ${totalSats} of the ${needed} needed to perform the action and pay its fee.`,
			"shortfall",
		);
	}

	return { selected, totalSats };
}

function byLargestFirst(a: SelectableUtxo, b: SelectableUtxo): number {
	const left = toSats(a.amount);
	const right = toSats(b.amount);

	if (left === right) {
		return 0;
	}

	return left > right ? -1 : 1;
}

export function toSats(amount: string): bigint {
	try {
		return BigInt(amount);
	} catch {
		return 0n;
	}
}
