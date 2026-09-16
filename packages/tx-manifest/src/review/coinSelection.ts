import { byOutpoint } from "../chain/outpoint";

export type SelectableUtxo = {
	amount: string;
	confidential?: boolean;
	scriptPubKeyHex?: string;
	spendable: boolean;
	txOut: string;
	txid: string;
	vout: number;
};

export type CoinSelection =
	| { ok: false; reason: string }
	| { ok: true; selected: SelectableUtxo[]; totalSats: bigint };

export function selectCoins(
	available: SelectableUtxo[],
	targetSats: bigint,
	headroomSats: bigint,
): CoinSelection {
	if (targetSats <= 0n) {
		return { ok: false, reason: "Nothing to fund." };
	}

	const needed = targetSats + headroomSats;
	const distinct = byOutpoint(available.filter((utxo) => utxo.spendable));
	const spendable = distinct.filter((utxo) => !utxo.confidential).toSorted(byLargestFirst);
	const withheldFrom = distinct.filter((utxo) => utxo.confidential);

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
		return {
			ok: false,
			reason:
				`This account holds ${totalSats} of the ${needed} needed to perform the action and pay its fee.` +
				withheldSentence(withheldFrom),
		};
	}

	return { ok: true, selected, totalSats };
}

export function withheldSentence(confidential: SelectableUtxo[]): string {
	const withheld = confidential.reduce((sum, utxo) => sum + toSats(utxo.amount), 0n);

	return withheld > 0n
		? ` A further ${withheld} is in confidential outputs, which a contract action cannot spend — send it to this account's unblinded address to use it.`
		: "";
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
