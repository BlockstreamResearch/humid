/** One wallet output the selector may spend, as the wallet already describes it. */
export type SelectableUtxo = {
	amount: string;
	spendable: boolean;
	txOut: string;
	txid: string;
	vout: number;
};

export type CoinSelection =
	| { ok: false; reason: string }
	| { ok: true; selected: SelectableUtxo[]; totalSats: bigint };

/**
 * Chooses which of the wallet's outputs pay for an action.
 *
 * Largest-first, which keeps the input count and therefore the fee down, and stops as soon
 * as the target is covered. `headroomSats` is what the caller adds for a fee it cannot know
 * exactly yet — the final figure comes from the assembled transaction's weight, and
 * selecting for the outputs alone would leave nothing to pay it with.
 *
 * Selection stays here rather than inside the signing module deliberately: the wallet knows
 * which of its outputs it is willing to spend, and a module choosing on its behalf would be
 * making that decision somewhere the wallet cannot see.
 */
export function selectCoins(
	available: SelectableUtxo[],
	targetSats: bigint,
	headroomSats: bigint,
): CoinSelection {
	if (targetSats <= 0n) {
		return { ok: false, reason: "Nothing to fund." };
	}

	const needed = targetSats + headroomSats;
	const spendable = available.filter((utxo) => utxo.spendable).toSorted(byLargestFirst);

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

/**
 * Largest first, and equal amounts in the order the wallet listed them.
 *
 * Returning 0 for a tie is what makes that second half true. A comparator that answers -1 to
 * both "a before b" and "b before a" contradicts itself, and a sort is free to act on either
 * answer — so two outputs of the same size could come out in either order, and which of them
 * a transaction spent would depend on the engine rather than on anything the wallet decided.
 * The same request has to select the same outputs twice.
 */
function byLargestFirst(a: SelectableUtxo, b: SelectableUtxo): number {
	const left = toSats(a.amount);
	const right = toSats(b.amount);

	if (left === right) {
		return 0;
	}

	return left > right ? -1 : 1;
}

/** Amounts arrive as base-unit strings and stay exact; a double would round past 2^53. */
export function toSats(amount: string): bigint {
	try {
		return BigInt(amount);
	} catch {
		return 0n;
	}
}
