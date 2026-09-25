import { byOutpoint } from "../chain/outpoint";

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
		return {
			ok: false,
			reason: `This account holds ${totalSats} of the ${needed} needed to perform the action and pay its fee.`,
		};
	}

	return { ok: true, selected, totalSats };
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
