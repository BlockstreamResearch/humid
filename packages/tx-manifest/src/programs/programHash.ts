import { isHash } from "../chain/hex";
import { Refusal } from "../refusal";

export const PROGRAM_HASH_SEED = "0".repeat(64);

export const ITERATION_BOUND = 8;

export type ScriptHashOf = (input: {
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

export function createProgramHasher(
	scriptHashOf: ScriptHashOf,
	includeDebugSymbols: boolean,
): HashProgram {
	return ({ argumentsJson, extraLeavesJson, source }) => {
		let hash: string;

		try {
			hash = scriptHashOf({ argumentsJson, extraLeavesJson, includeDebugSymbols, source });
		} catch (error) {
			throw new Refusal(`the contract did not compile: ${String(error)}`);
		}

		if (!isHash(hash)) {
			throw new Refusal(
				"the compiler did not return a script hash, 32 bytes as 64 hexadecimal characters.",
			);
		}

		return hash;
	};
}
