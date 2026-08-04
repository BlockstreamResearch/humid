import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { HashCovenant } from "./computed";

/** Compiles a contract with its arguments and returns the scriptPubKey it locks to, as hex. */
export type CompileScriptPubKey = (input: { argumentsJson: string; source: string }) => string;

/**
 * Turns a compiler into the covenant-hash function the computed parameters need.
 *
 * A covenant's script hash is `SHA256(scriptPubKey)` — the value Simplicity's
 * `input_script_hash` jet returns, and what a manifest's `*_COV_HASH` fields hold. It is
 * therefore a hash of the *bytes*, and the compiler hands back hex; decoding first rather
 * than hashing the text is the difference between the value a contract will check against
 * and a plausible-looking wrong one.
 */
export function covenantHashFrom(compile: CompileScriptPubKey): HashCovenant {
	return (input) => bytesToHex(sha256(hexToBytes(compile(input))));
}
