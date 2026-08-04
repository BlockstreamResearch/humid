/** One wallet output the selector may spend, as the wallet already describes it. */
export type SelectableUtxo = {
	amount: string;
	/**
	 * Where this output pays, when the wallet knows it.
	 *
	 * Only needed by an action that pins an input to one address. Optional because the
	 * wallet's own snapshot carries it and a caller assembling one by hand should not have to.
	 */
	scriptPubKeyHex?: string;
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
	const spendable = available
		.filter((utxo) => utxo.spendable)
		.slice()
		.sort((a, b) => (toSats(b.amount) > toSats(a.amount) ? 1 : -1));

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

/** Amounts arrive as base-unit strings and stay exact; a double would round past 2^53. */
function toSats(amount: string): bigint {
	try {
		return BigInt(amount);
	} catch {
		return 0n;
	}
}
