import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

export const COVENANT_HASH_SEED = "0".repeat(64);

export const ITERATION_BOUND = 8;

export type CompileScriptPubKey = (input: {
	argumentsJson: string;
	extraLeavesJson: string;
	includeDebugSymbols: boolean;
	source: string;
}) => string;

export type CovenantHashResult = { hash: string; ok: true } | { ok: false; reason: string };

export type HashCovenant = (input: {
	argumentsJson: string;
	extraLeavesJson: string;
	source: string;
}) => CovenantHashResult;

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
