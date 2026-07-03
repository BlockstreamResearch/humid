import { sha256 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const HARDENED_OFFSET = 0x80000000;

export const LIQUID_IDENTITY_PURPOSES = {
	SLIP_0013: 13,
	SLIP_0017: 17,
} as const;

export type LiquidIdentityPurpose =
	(typeof LIQUID_IDENTITY_PURPOSES)[keyof typeof LIQUID_IDENTITY_PURPOSES];

export function deriveSlipIdentityPath(input: {
	identity: string;
	index: number;
	purpose: LiquidIdentityPurpose;
}): number[] {
	const digest = sha256(
		concatBytes(toUint32LittleEndian(input.index), utf8ToBytes(input.identity)),
	);

	return [
		toHardenedIndex(input.purpose),
		toHardenedIndex(readUint32LittleEndian(digest, 0)),
		toHardenedIndex(readUint32LittleEndian(digest, 4)),
		toHardenedIndex(readUint32LittleEndian(digest, 8)),
		toHardenedIndex(readUint32LittleEndian(digest, 12)),
	];
}

function toUint32LittleEndian(value: number): Uint8Array {
	const bytes = new Uint8Array(4);
	const view = new DataView(bytes.buffer);

	view.setUint32(0, value, true);

	return bytes;
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	return view.getUint32(offset, true);
}

function toHardenedIndex(value: number): number {
	return (value | HARDENED_OFFSET) >>> 0;
}
