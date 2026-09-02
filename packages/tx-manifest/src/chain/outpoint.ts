/**
 * Which transaction output a thing is, as one answer the whole package shares.
 *
 * An outpoint is the only identity a transaction output has. It is not the object the wallet
 * described it with: a wallet assembling a snapshot from more than one source, or answering
 * two questions about two assets, hands back two objects for one output that share no
 * identity at all. Anything comparing those objects — or comparing keys it spelled for
 * itself — decides that one output is two, and a transaction that spends one output twice is
 * not a transaction.
 *
 * So the key is written once, here, and every part of this package that has to say "the same
 * output" asks for it rather than building `${txid}:${vout}` again. The casing is why that
 * matters more than tidiness: a txid is bytes, and the same bytes written in two cases are
 * the same output. Two places that each spelled their own key would agree until one of them
 * met a wallet that upper-cased its ids, and then would silently disagree.
 */

/** One transaction output, named the way the chain names it. */
export type Outpoint = { txid: string; vout: number };

/**
 * The one spelling of "this output" that everything here compares by.
 *
 * Lower-cased and trimmed, because a txid is thirty-two bytes and their spelling is not part
 * of which output they name.
 */
export function outpointKey(outpoint: Outpoint): string {
	return `${outpoint.txid.trim().toLowerCase()}:${outpoint.vout}`;
}

/**
 * One entry per outpoint, keeping the first each was described by.
 *
 * The first rather than the largest or the newest: the wallet listed them in an order, and
 * two descriptions of one output are the same output, so there is nothing to choose between
 * them. Keeping the first is what makes the same snapshot answer the same way twice.
 */
export function byOutpoint<T extends Outpoint>(entries: T[]): T[] {
	const seen = new Set<string>();

	return entries.filter((entry) => {
		const key = outpointKey(entry);

		if (seen.has(key)) {
			return false;
		}

		seen.add(key);

		return true;
	});
}
