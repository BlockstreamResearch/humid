/**
 * Laying the transaction's inputs out in the order the document states rather than the wallet's.
 *
 * A covenant introspects positions: a program that reads input zero reads whatever is at input
 * zero, and one that asserts its own index will not run anywhere else. So where an input sits is
 * part of what the document says, and a wallet with an order of its own — every covenant first,
 * then whatever it chose to fund the rest — honours its own habit instead. Where the two agree
 * nothing is lost, and where they disagree the habit builds a transaction the contract rejects
 * while the wallet that could have built the right one refuses to build anything.
 *
 * What is here decides the order and nothing else. It does not decide whether the order is
 * acceptable: a piece it could not put where the document asked keeps whatever place it was
 * given, and `checkPositions` reads the result and refuses by name. Keeping placement apart from
 * the check is what keeps an impossible document impossible — two inputs claiming one index
 * cannot both have it, in any order — and it is why being able to place is not a way to stop
 * refusing.
 */

/** One input the action declares, and the pieces the wallet would build it from. */
export type PlaceableInput<Slot> = {
	/** The manifest's id, so where it landed can be reported against what it asked for. */
	id?: string;
	/**
	 * What this declared input is built from, in the order those pieces must be spent.
	 *
	 * More than one when the wallet needed more than one of its own outputs to cover the amount
	 * the action asks for, and they stay together: a declared input whose pieces are scattered
	 * through the transaction has no one position for a contract to read. None at all when the
	 * wallet builds nothing for it, which is a declaration with no place rather than a place of
	 * nought — it is left out, and the caller says what that means.
	 */
	slots: Slot[];
	/**
	 * Where the document says it goes: from the start when positive, from the end when negative.
	 *
	 * Absent when the document says nothing, which is most inputs — a fee input is the wallet's
	 * own business and every published document leaves it unplaced.
	 */
	stated?: number;
};

export type InputPlacement<Slot> = {
	/** Where each declared input's first piece landed, by the id the document names it. */
	at: Map<string, number>;
	/** The transaction's inputs, in the order the wallet must add them. */
	order: Slot[];
};

/**
 * Works out which input goes where, honouring every stated position that can be honoured.
 *
 * Stated positions are taken in the order the action declares them, because a place already
 * taken cannot be given twice and declaration order is the only tie-break that does not depend
 * on how the wallet happened to fund something. Everything else falls into what is left, in the
 * same order — so an input nothing was stated for still lands somewhere the caller can name.
 */
export function placeInputs<Slot>(declared: PlaceableInput<Slot>[]): InputPlacement<Slot> {
	const total = declared.reduce((count, input) => count + input.slots.length, 0);
	const laid: (Slot | undefined)[] = Array.from({ length: total });
	const at = new Map<string, number>();
	const remaining: PlaceableInput<Slot>[] = [];

	for (const input of declared) {
		if (input.slots.length === 0) {
			continue;
		}

		const wanted = resolve(input.stated, total);

		if (wanted === undefined || !vacant(laid, wanted, input.slots.length)) {
			remaining.push(input);
			continue;
		}

		for (const [offset, slot] of input.slots.entries()) {
			laid[wanted + offset] = slot;
		}

		if (input.id !== undefined) {
			at.set(input.id, wanted);
		}
	}

	// What is left over is either an input the document stated nothing for or one whose stated
	// place was already taken. The second still gets a place rather than none, so the refusal
	// that follows can say where the wallet would have put it instead of only that it could not.
	let next = 0;

	for (const input of remaining) {
		for (const slot of input.slots) {
			while (laid[next] !== undefined) {
				next += 1;
			}

			if (input.id !== undefined && !at.has(input.id)) {
				at.set(input.id, next);
			}

			laid[next] = slot;
		}
	}

	return { at, order: laid.filter((slot): slot is Slot => slot !== undefined) };
}

/** A stated position read against the total, since a negative one counts from the end. */
function resolve(stated: number | undefined, total: number): number | undefined {
	if (stated === undefined) {
		return undefined;
	}

	return stated < 0 ? total + stated : stated;
}

/** Whether a run of that length starting there is inside the transaction and still empty. */
function vacant<Slot>(laid: (Slot | undefined)[], from: number, length: number): boolean {
	if (!Number.isInteger(from) || from < 0 || from + length > laid.length) {
		return false;
	}

	for (let at = from; at < from + length; at += 1) {
		if (laid[at] !== undefined) {
			return false;
		}
	}

	return true;
}
