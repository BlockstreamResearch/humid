import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha512 } from "@noble/hashes/sha2.js";

export function deriveBip39Seed(mnemonic: string): Uint8Array {
	return pbkdf2(sha512, mnemonic.normalize("NFKD"), "mnemonic".normalize("NFKD"), {
		c: 2048,
		dkLen: 64,
	});
}
