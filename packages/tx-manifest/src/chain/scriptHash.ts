import { sha256 } from "@noble/hashes/sha2.js";

import { decodeHex, encodeHex } from "./hex";

export function scriptHashOf(scriptPubKeyHex: string): string {
	const script = decodeHex(scriptPubKeyHex);

	if (!script) {
		throw new TypeError(`The script ${scriptPubKeyHex} is not hex.`);
	}

	return encodeHex(sha256(script));
}
