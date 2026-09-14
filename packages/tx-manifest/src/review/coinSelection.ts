import { byOutpoint } from "../chain/outpoint";

/** One wallet output the selector may spend, as the wallet already describes it. */
export type SelectableUtxo = {
	amount: string;
	/**
	 * Whether this output's amount and asset are hidden on chain.
	 *
	 * A confidential one cannot fund a contract action: unblinding it needs the secrets that
	 * go with it, and nothing in this package or in the module that signs is ever handed one —
	 * an outpoint and its bytes is the whole of what they get. Selecting one produces a
	 * transaction that fails inside the signing module, far from the output that caused it,
	 * so it is excluded here where the reason can still be said. Optional because a caller
	 * assembling a list by hand has nothing to hide.
	 */
	confidential?: boolean;
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
	// One entry per outpoint before anything is counted or chosen, so that both halves of the
	// answer below are about outputs rather than about descriptions of them.
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

/**
 * What is there and cannot be used, said only when there is some.
 *
 * A person looking at a balance that covers the amount has to be told why it does not count,
 * rather than told they are short of money they can see on their own screen. Written from
 * outputs already reduced to one entry each: a total that counted a description twice would
 * quote them a figure larger than they hold, in the same sentence that told them it was
 * unusable.
 */
export function withheldSentence(confidential: SelectableUtxo[]): string {
	const withheld = confidential.reduce((sum, utxo) => sum + toSats(utxo.amount), 0n);

	return withheld > 0n
		? ` A further ${withheld} is in confidential outputs, which a contract action cannot spend — send it to this account's unblinded address to use it.`
		: "";
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
