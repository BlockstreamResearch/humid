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
	const bytes = decode(transactionHex);

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

type Reader = { at: number; bytes: Uint8Array };

function decode(hex: string): Uint8Array | undefined {
	const digits = hex.startsWith("0x") ? hex.slice(2) : hex;

	if (digits.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(digits)) {
		return undefined;
	}

	return Uint8Array.from(digits.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function skip(reader: Reader, count: number): boolean {
	if (reader.at + count > reader.bytes.length) {
		return false;
	}

	reader.at += count;

	return true;
}

/** A txid is serialised in reverse of how it is written, which is why it is turned back. */
function readReversedHex(reader: Reader, length: number): string | undefined {
	if (reader.at + length > reader.bytes.length) {
		return undefined;
	}

	const slice = reader.bytes.slice(reader.at, reader.at + length);

	reader.at += length;

	return [...slice]
		.reverse()
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function readUint32(reader: Reader): number | undefined {
	if (reader.at + 4 > reader.bytes.length) {
		return undefined;
	}

	let value = 0;

	for (let offset = 3; offset >= 0; offset -= 1) {
		value = value * 256 + (reader.bytes[reader.at + offset] ?? 0);
	}

	reader.at += 4;

	return value;
}

function readVarint(reader: Reader): bigint | undefined {
	const first = reader.bytes[reader.at];

	if (first === undefined) {
		return undefined;
	}

	reader.at += 1;

	const widths: Record<number, number> = { 0xfd: 2, 0xfe: 4, 0xff: 8 };
	const width = widths[first];

	if (width === undefined) {
		return BigInt(first);
	}

	if (reader.at + width > reader.bytes.length) {
		return undefined;
	}

	let value = 0n;

	for (let offset = width - 1; offset >= 0; offset -= 1) {
		value = value * 256n + BigInt(reader.bytes[reader.at + offset] ?? 0);
	}

	reader.at += width;

	return value;
}
