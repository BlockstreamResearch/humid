/** One wallet output the selector may spend, as the wallet already describes it. */
export type SelectableUtxo = {
	amount: string;
	/**
	 * Whether this output's amount and asset are hidden on chain.
	 *
	 * A confidential one cannot fund a contract action: unblinding it needs the secrets
	 * that go with it, and the signing module is handed an outpoint and its bytes and
	 * nothing else. Selecting one produces a transaction that fails inside the module,
	 * far from the output that caused it. Optional because a caller assembling a list by
	 * hand has nothing to hide.
	 */
	confidential?: boolean;
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
	const usable = available.filter((utxo) => utxo.spendable && !utxo.confidential);
	const spendable = usable
		.slice()
		.toSorted((a, b) => (toSats(b.amount) > toSats(a.amount) ? 1 : -1));

	// What is there and cannot be used, so a refusal can say so. A person looking at a
	// balance that covers the amount needs to be told why it does not count, rather than
	// being told they are short of money they can see.
	const withheld = available
		.filter((utxo) => utxo.spendable && utxo.confidential)
		.reduce((sum, utxo) => sum + toSats(utxo.amount), 0n);

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
				(withheld > 0n
					? ` A further ${withheld} is in confidential outputs, which a contract action cannot spend — send it to this account's unblinded address to use it.`
					: ""),
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
