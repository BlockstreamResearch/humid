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

export function readHex(reader: Reader, length: number): string | undefined {
	if (length < 0 || reader.at + length > reader.bytes.length) {
		return undefined;
	}

	const slice = reader.bytes.slice(reader.at, reader.at + length);

	reader.at += length;

	return encodeHex(slice);
}

export function readReversedHex(reader: Reader, length: number): string | undefined {
	const forwards = readHex(reader, length);

	return forwards === undefined ? undefined : (forwards.match(/../g) ?? []).toReversed().join("");
}

export function readUint8(reader: Reader): number | undefined {
	if (reader.at + 1 > reader.bytes.length) {
		return undefined;
	}

	const byte = reader.bytes[reader.at];

	reader.at += 1;

	return byte;
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

	return value >>> 0;
}

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
