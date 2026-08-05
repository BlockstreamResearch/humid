import { decodeHex, readReversedHex, readUint32, readVarint, skip } from "./bytes";

/** One transaction input, as the outpoint it spends. */
export type OutPoint = { txid: string; vout: number };

export type SpentInputs = { ok: true; spent: OutPoint[] } | { ok: false; reason: string };

/**
 * The outpoints a finished transaction spends, read out of its own bytes.
 *
 * Deliberately parsed rather than asked for. This exists to catch a signing module spending
 * something the wallet did not ask it to, and a module's own account of what it spent is the
 * one source that cannot answer that question — it would be the same component reporting on
 * itself. The bytes are what would reach the network.
 *
 * Only as far as the inputs, which sit near the front: version, the segwit marker, the input
 * count, and then each input's outpoint, script and sequence. Everything after is somebody
 * else's business.
 */
export function spentInputs(transactionHex: string): SpentInputs {
	const bytes = decodeHex(transactionHex);

	if (!bytes) {
		return { ok: false, reason: "The signed transaction is not hex." };
	}

	const reader = { at: 0, bytes };

	// Version, then the marker Elements uses to say whether witness data follows.
	if (!skip(reader, 5)) {
		return { ok: false, reason: "The signed transaction ends before its inputs." };
	}

	const count = readVarint(reader);

	if (count === undefined) {
		return { ok: false, reason: "The signed transaction declares no input count." };
	}

	const spent: OutPoint[] = [];

	for (let index = 0n; index < count; index += 1n) {
		const txid = readReversedHex(reader, 32);
		const vout = readUint32(reader);
		const scriptLength = readVarint(reader);

		if (txid === undefined || vout === undefined || scriptLength === undefined) {
			return { ok: false, reason: `The signed transaction ends inside input ${index}.` };
		}

		if (!skip(reader, Number(scriptLength) + 4)) {
			return { ok: false, reason: `The signed transaction ends inside input ${index}.` };
		}

		// Elements marks issuance and peg-in in the top two bits of the index rather than in
		// a field of their own, so the index has to be unmasked before it means anything.
		spent.push({ txid, vout: vout & 0x3f_ff_ff_ff });
	}

	return { ok: true, spent };
}
