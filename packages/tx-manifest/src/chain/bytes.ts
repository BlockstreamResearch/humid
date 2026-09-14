/**
 * Reading and writing consensus-encoded bytes.
 *
 * Hex is how every id, script and payload crosses this package's boundary, and the
 * conversion is written once here rather than at each place that needs it. Nothing in this
 * module knows what the bytes mean — a caller that has to reverse an id does so itself,
 * because whether a run of bytes is written forwards or backwards is a fact about what it
 * is rather than about hexadecimal.
 */

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
