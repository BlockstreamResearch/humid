/**
 * Landing an input or output where the document says it must be.
 *
 * A covenant introspects positions: a program that asserts its collateral is input two reads
 * input two, whatever the wallet meant. So a transaction built with the pieces in another
 * order is not a slightly different transaction — it is one the network rejects after it has
 * been signed, for a reason nobody watching the wallet could have predicted.
 *
 * The reference implementation parses this and checks nothing, and the corpus states it
 * eighty-nine times. Being stricter here is the maintainer's decision of 2026-08-14, taken on
 * the ground that a refusal before signing beats a rejection after it.
 */

/** One position the document states, and the one the wallet's own layout produces. */
export type StatedPosition = {
	/** Where this piece actually lands, counted from the start. */
	at: number;
	/** The manifest's id, so a refusal names the thing rather than a number. */
	id: string;
	kind: "input" | "output";
	/** What the document asked for: from the start when positive, from the end when negative. */
	stated: number;
};

export type PositionCheck = { ok: true } | { ok: false; reason: string };

/**
 * Checks every stated position against where the wallet will actually put things.
 *
 * A negative index counts from the end — `-1` is the last — so it cannot be read without
 * knowing how many there are, which is why the totals are arguments rather than something
 * this works out for itself. Getting that wrong silently would place a piece one off the end.
 */
export function checkPositions(
	stated: StatedPosition[],
	totals: { inputs: number; outputs: number },
): PositionCheck {
	for (const position of stated) {
		const total = position.kind === "input" ? totals.inputs : totals.outputs;
		const wanted = position.stated < 0 ? total + position.stated : position.stated;

		if (wanted === position.at) {
			continue;
		}

		return {
			ok: false,
			reason:
				`The ${position.kind} ${position.id} must be ${position.kind} ${describe(position.stated, total)} ` +
				`of this transaction, and this wallet would put it at ${position.at}. A covenant reads ` +
				"positions, so a transaction built in another order is one the network rejects after " +
				"it has been signed.",
		};
	}

	return { ok: true };
}

/** How a stated position reads to someone who did not write it. */
function describe(stated: number, total: number): string {
	return stated < 0
		? `${total + stated} — the document counts ${stated} from the end`
		: `${stated}`;
}
