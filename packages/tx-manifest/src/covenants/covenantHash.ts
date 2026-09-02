import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

/**
 * What the first round of iteration stands a covenant hash on.
 *
 * Thirty-two zero bytes, matching the format's reference implementation. It is not a plausible
 * hash and is not meant to be — it exists so a contract whose parameters name a hash that does
 * not exist yet can still be compiled once, which is what makes the second round possible.
 */
export const COVENANT_HASH_SEED = "0".repeat(64);

/**
 * How many rounds a set of mutually referencing hashes gets before the action fails.
 *
 * A chain of n covenants each naming the next settles in n rounds, so the bound is a limit on
 * how deep a protocol may nest rather than on how hard convergence is. Eight is far past
 * anything the published corpus contains and small enough that an unstable manifest fails
 * quickly.
 */
export const ITERATION_BOUND = 8;

/**
 * Compiles a contract to the scriptPubKey it locks to, as hex.
 *
 * Separate from the full compile port because a hash needs no address: what is hashed is the
 * locking script, and an address is one rendering of it. The network the script is rendered for
 * is the wallet's own and is bound by whoever supplies this, which is why it is absent here.
 *
 * Everything else a full compile is given is here, because a hash of a contract built any
 * differently is the hash of a different contract — and a manifest stores that hash as a
 * parameter of the covenant it then locks funds into.
 */
export type CompileScriptPubKey = (input: {
	argumentsJson: string;
	/** Already-encoded taproot leaf payloads, appended to the tree in declaration order. */
	extraLeavesJson: string;
	/** The mode this protocol declares its contracts were built in. */
	includeDebugSymbols: boolean;
	source: string;
}) => string;

export type CovenantHashResult = { hash: string; ok: true } | { ok: false; reason: string };

/**
 * Compiles a contract with its arguments and returns the hash of its scriptPubKey.
 *
 * A synchronous port on purpose: the fixed point that settles a set of mutually referencing
 * hashes recompiles all of them together, once per round, and an asynchronous step inside that
 * loop would make the number of rounds depend on scheduling rather than on the document.
 *
 * It reports a failure rather than throwing one. A compiler is a wallet's own module across a
 * wasm boundary and it can fail — a source that will not compile, a module that will not load —
 * and every such failure has to reach the person as a refusal that says which contract. An
 * exception escaping the fixed point would instead reject the whole review, which the caller
 * reads as the wallet crashing rather than as the wallet declining.
 */
export type HashCovenant = (input: {
	argumentsJson: string;
	extraLeavesJson: string;
	source: string;
}) => CovenantHashResult;

/**
 * Turns a compiler into the covenant-hash function a document's computed fields need.
 *
 * A covenant's script hash is `SHA256(scriptPubKey)` — the value Simplicity's
 * `input_script_hash` jet returns, and what a manifest's `*_COV_HASH` fields hold. It is
 * therefore a hash of the *bytes*, and the compiler hands back hex; decoding first rather than
 * hashing the text is the difference between the value a contract will check against and a
 * plausible-looking wrong one.
 *
 * **The build mode is bound here rather than asked for per call.** It is a property of the
 * document — one protocol declares its contracts were built with debug symbols and another does
 * not — so it cannot vary between two covenants of the same manifest, and a caller able to pass
 * it per call is a caller able to pass it inconsistently.
 *
 * What comes back is checked before it is hashed. A compiler that throws, or returns something
 * that is not a whole number of bytes of hex, has not produced a scriptPubKey — and hashing the
 * text of whatever it did produce would yield thirty-two plausible bytes that no contract will
 * ever match.
 */
export function covenantHashFrom(
	compile: CompileScriptPubKey,
	includeDebugSymbols: boolean,
): HashCovenant {
	return ({ argumentsJson, extraLeavesJson, source }) => {
		let scriptPubKeyHex: string;

		try {
			scriptPubKeyHex = compile({
				argumentsJson,
				extraLeavesJson,
				includeDebugSymbols,
				source,
			});
		} catch (error) {
			return { ok: false, reason: `the contract did not compile: ${String(error)}` };
		}

		const hex = scriptPubKeyHex.trim();

		if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
			return {
				ok: false,
				reason:
					"the compiler did not return a scriptPubKey. A covenant's hash is the hash of its " +
					"locking script's bytes, and what came back is not bytes.",
			};
		}

		return { hash: bytesToHex(sha256(hexToBytes(hex))), ok: true };
	};
}
