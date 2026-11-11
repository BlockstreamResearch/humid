import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { Refusal } from "../refusal";

export const PROGRAM_HASH_SEED = "0".repeat(64);

export const ITERATION_BOUND = 8;

export type CompileScriptPubKey = (input: {
	argumentsJson: string;
	extraLeavesJson: string;
	includeDebugSymbols: boolean;
	source: string;
}) => string;

export type HashProgram = (input: {
	argumentsJson: string;
	extraLeavesJson: string;
	source: string;
}) => string;

export function programHashFrom(
	compile: CompileScriptPubKey,
	includeDebugSymbols: boolean,
): HashProgram {
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
			throw new Refusal(`the contract did not compile: ${String(error)}`);
		}

		const hex = scriptPubKeyHex.trim();

		if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
			throw new Refusal(
				"the compiler did not return a scriptPubKey. A program's hash is the hash of its " +
					"locking script's bytes, and what came back is not bytes.",
			);
		}

		return bytesToHex(sha256(hexToBytes(hex)));
	};
}
