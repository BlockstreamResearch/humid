/**
 * Reading consensus-encoded bytes.
 *
 * Shared by everything in this package that reads a transaction rather than asking a module
 * what it contains: the guard that checks what a finished transaction spends, and the read
 * of what the chain says sits at an outpoint.
 */

export type Reader = { at: number; bytes: Uint8Array };

export function decodeHex(hex: string): Uint8Array | undefined {
	const digits = hex.startsWith("0x") ? hex.slice(2) : hex;

	if (digits.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(digits)) {
		return undefined;
	}

	return Uint8Array.from(digits.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

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
	if (reader.at + length > reader.bytes.length) {
		return undefined;
	}

	const slice = reader.bytes.slice(reader.at, reader.at + length);

	reader.at += length;

	return encodeHex(slice);
}

/** A txid is serialised in reverse of how it is written, which is why it is turned back. */
export function readReversedHex(reader: Reader, length: number): string | undefined {
	if (reader.at + length > reader.bytes.length) {
		return undefined;
	}

	const slice = reader.bytes.slice(reader.at, reader.at + length);

	reader.at += length;

	return encodeHex(slice.toReversed());
}

export function readUint32(reader: Reader): number | undefined {
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

export function readVarint(reader: Reader): bigint | undefined {
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
