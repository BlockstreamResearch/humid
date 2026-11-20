import { bytesToHex } from "@noble/hashes/utils.js";

const EVEN_HEX = /^(?:[0-9a-fA-F]{2})*$/;
const HASH = /^[0-9a-fA-F]{64}$/;

export function withoutHexPrefix(text: string): string {
	return /^0x/i.test(text) ? text.slice(2) : text;
}

export function decodeHex(hex: string): Uint8Array | undefined {
	const digits = withoutHexPrefix(hex);

	return EVEN_HEX.test(digits)
		? Uint8Array.from(digits.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16))
		: undefined;
}

export function encodeHex(bytes: Uint8Array): string {
	return bytesToHex(bytes);
}

export function reverseHex(hex: string): string {
	return (hex.match(/../g) ?? []).toReversed().join("");
}

export function isHash(hex: string): boolean {
	return HASH.test(hex);
}
