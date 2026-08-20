import {
	decodeHex,
	type Reader,
	readReversedHex,
	readUint8,
	readUint32,
	readVarint,
	skip,
} from "./bytes";

/** The top bit of an input's index, which says four more fields follow its sequence. */
const ISSUANCE_FLAG = 0x8000_0000;

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
		if ((vout & ISSUANCE_FLAG) !== 0 && !skipIssuance(reader)) {
			return { ok: false, reason: `The signed transaction ends inside input ${index}.` };
		}

		spent.push({ txid, vout: vout & 0x3f_ff_ff_ff });
	}

	return { ok: true, spent };
}

/**
 * Walks past the issuance an input declares: two 32-byte fields and two amounts.
 *
 * An amount here is a confidential value, which is one byte saying what it is and then that
 * many more — nothing, eight bytes in the open, or a thirty-two byte commitment. Skipping a
 * fixed width instead would work until the first transaction that hid one, and then it would
 * not fail: it would read the next input's outpoint out of the middle of this one.
 */
function skipIssuance(reader: Reader): boolean {
	// The blinding nonce and the entropy, both fixed.
	if (!skip(reader, 64)) {
		return false;
	}

	return skipConfidentialValue(reader) && skipConfidentialValue(reader);
}

/** One confidential value: absent, explicit, or committed to. */
function skipConfidentialValue(reader: Reader): boolean {
	const prefix = readUint8(reader);

	if (prefix === undefined) {
		return false;
	}

	if (prefix === 0x00) {
		return true;
	}

	if (prefix === 0x01) {
		return skip(reader, 8);
	}

	// 0x08 and 0x09 are the two parities a commitment is written with; anything else is not a
	// value this reader knows, and guessing its width would put every later input somewhere else.
	return (prefix === 0x08 || prefix === 0x09) && skip(reader, 32);
}
