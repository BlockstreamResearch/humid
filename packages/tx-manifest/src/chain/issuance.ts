import { SHA256, sha256 } from "@noble/hashes/sha2.js";

import { decodeHex, encodeHex } from "./bytes";
import type { Outpoint } from "./outpoint";

export type { Outpoint };

export type DerivedIssuance = {
	asset: string;
	entropy: string;
	reissuanceToken: string;
};

export function deriveNewIssuance(
	outpoint: Outpoint,
	contractHash = ZERO_HASH,
): DerivedIssuance | undefined {
	const spent = serialiseOutpoint(outpoint);
	const contract = readId(contractHash);

	if (!spent || !contract) {
		return undefined;
	}

	const entropy = combine(sha256(sha256(spent)), contract);

	return {
		asset: writeId(combine(entropy, ASSET)),
		entropy: writeId(entropy),
		reissuanceToken: writeId(combine(entropy, TOKEN)),
	};
}

export function assetFromEntropy(entropy: string): string | undefined {
	const bytes = readId(entropy);

	return bytes ? writeId(combine(bytes, ASSET)) : undefined;
}

const ZERO_HASH = "0".repeat(64);

const ASSET = new Uint8Array(32);

const TOKEN = Uint8Array.from([1, ...Array.from({ length: 31 }, () => 0)]);

function combine(left: Uint8Array, right: Uint8Array): Uint8Array {
	const block = new Uint8Array(64);

	block.set(left, 0);
	block.set(right, 32);

	return new Midstate().compress(block);
}

class Midstate extends SHA256 {
	compress(block: Uint8Array): Uint8Array {
		this.process(new DataView(block.buffer, block.byteOffset, block.byteLength), 0);

		const out = new Uint8Array(32);
		const writer = new DataView(out.buffer);

		this.get().forEach((word, at) => writer.setUint32(at * 4, word >>> 0, false));

		return out;
	}
}

function serialiseOutpoint(outpoint: Outpoint): Uint8Array | undefined {
	const transaction = readId(outpoint.txid);

	if (!transaction || !Number.isInteger(outpoint.vout) || outpoint.vout < 0) {
		return undefined;
	}

	const bytes = new Uint8Array(36);

	bytes.set(transaction, 0);
	new DataView(bytes.buffer).setUint32(32, outpoint.vout, true);

	return bytes;
}

function readId(hex: string): Uint8Array | undefined {
	const bytes = decodeHex(hex);

	return bytes?.length === 32 ? bytes.toReversed() : undefined;
}

function writeId(bytes: Uint8Array): string {
	return encodeHex(bytes.toReversed());
}
