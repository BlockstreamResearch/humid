/**
 * Reading and writing consensus-encoded bytes.
 *
 * Hex is how every id, script and payload crosses this package's boundary, and the conversion
 * is written once here rather than at each place that needs it. What was added beside it is a
 * reader: the fixed-width fields a consensus-encoded transaction is made of, each leaving the
 * reader after what it took. Nothing here knows what any of them mean — that a txid is written
 * backwards, or that an eight-byte amount is big-endian, is a fact about what the field is
 * rather than about hexadecimal, and it is stated where the field is read.
 *
 * **The compact-size count is deliberately not among them.** It is the one field whose reading
 * is a decision rather than a width: the same number can be written four ways and only one of
 * them is how the encoding writes it, so a lenient reader and a strict one disagree about which
 * byte strings are the same transaction. Two of those living side by side is worse than either,
 * because whichever one a future caller reaches for is the one that decides. So it is written
 * once, strictly, next to the parser that is the only thing entitled to an opinion about it.
 */

/** A position in a run of bytes, carried rather than returned so a walk stays a walk. */
export type Reader = { at: number; bytes: Uint8Array };

/** The bytes this hex spells, or nothing when the text is not hex at all. */
export function decodeHex(hex: string): Uint8Array | undefined {
	const digits = hex.startsWith("0x") ? hex.slice(2) : hex;

	if (digits.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(digits)) {
		return undefined;
	}

	return Uint8Array.from(digits.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

/** The same conversion back, always lower case and always two digits a byte. */
export function encodeHex(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function skip(reader: Reader, count: number): boolean {
	if (count < 0 || reader.at + count > reader.bytes.length) {
		return false;
	}

	reader.at += count;

	return true;
}

/** Takes `length` bytes as hex, leaving the reader after them. */
export function readHex(reader: Reader, length: number): string | undefined {
	if (length < 0 || reader.at + length > reader.bytes.length) {
		return undefined;
	}

	const slice = reader.bytes.slice(reader.at, reader.at + length);

	reader.at += length;

	return encodeHex(slice);
}

/** A txid is serialised in reverse of how it is written, which is why it is turned back. */
export function readReversedHex(reader: Reader, length: number): string | undefined {
	const forwards = readHex(reader, length);

	return forwards === undefined ? undefined : (forwards.match(/../g) ?? []).toReversed().join("");
}

/** One byte, leaving the reader after it. */
export function readUint8(reader: Reader): number | undefined {
	if (reader.at + 1 > reader.bytes.length) {
		return undefined;
	}

	const byte = reader.bytes[reader.at];

	reader.at += 1;

	return byte;
}

/** A four-byte little-endian integer, which is how a version, an index and a sequence are written. */
export function readUint32(reader: Reader): number | undefined {
	if (reader.at + 4 > reader.bytes.length) {
		return undefined;
	}

	let value = 0;

	for (let offset = 3; offset >= 0; offset -= 1) {
		value = value * 256 + (reader.bytes[reader.at + offset] ?? 0);
	}

	reader.at += 4;

	return value >>> 0;
}

/** A big-endian unsigned integer, which is how Elements writes an explicit amount. */
export function readUintBigEndian(reader: Reader, length: number): bigint | undefined {
	if (reader.at + length > reader.bytes.length) {
		return undefined;
	}

	let value = 0n;

	for (let offset = 0; offset < length; offset += 1) {
		value = value * 256n + BigInt(reader.bytes[reader.at + offset] ?? 0);
	}

	reader.at += length;

	return value;
}
