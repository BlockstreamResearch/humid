import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { HashCovenant } from "./computed";

/**
 * Compiles a contract with its arguments and returns the scriptPubKey it locks to, as hex.
 *
 * The same four things a full compile takes, because a hash of a covenant that was built
 * differently from the covenant is a hash of nothing. The leaves and the build mode are not
 * optional refinements of an address: each of them changes it outright.
 */
export type CompileScriptPubKey = (input: {
	argumentsJson: string;
	/** Already-encoded taproot leaf payloads, appended to the tree in declaration order. */
	extraLeavesJson: string;
	/** The mode this protocol declares its contracts were built in. */
	includeDebugSymbols: boolean;
	source: string;
}) => string;

/**
 * Turns a compiler into the covenant-hash function the computed parameters need.
 *
 * A covenant's script hash is `SHA256(scriptPubKey)` — the value Simplicity's
 * `input_script_hash` jet returns, and what a manifest's `*_COV_HASH` fields hold. It is
 * therefore a hash of the *bytes*, and the compiler hands back hex; decoding first rather
 * than hashing the text is the difference between the value a contract will check against
 * and a plausible-looking wrong one.
 *
 * **The build mode is bound here rather than asked for per call.** It is a property of the
 * document — one protocol declares its contracts were built with debug symbols and another
 * does not — so it cannot vary between two covenants of the same manifest, and a caller able
 * to pass it per call is a caller able to pass it inconsistently. The same two integers build
 * a different covenant in the other mode, which is measured rather than assumed.
 */
export function covenantHashFrom(
	compile: CompileScriptPubKey,
	includeDebugSymbols: boolean,
): HashCovenant {
	return ({ argumentsJson, extraLeavesJson, source }) =>
		bytesToHex(
			sha256(hexToBytes(compile({ argumentsJson, extraLeavesJson, includeDebugSymbols, source }))),
		);
}
