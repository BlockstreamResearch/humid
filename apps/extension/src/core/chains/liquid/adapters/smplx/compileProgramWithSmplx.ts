import type { reviewManifestAction } from "@humid/tx-manifest";

import type { SmplxWasmModule } from "./loadSmplxWasm";

type ReviewInput = Parameters<typeof reviewManifestAction>[1];
type CompileProgram = ReviewInput["compile"];
type ProgramAbiOf = ReviewInput["programAbi"];
type CompileScriptPubKey = ReviewInput["scriptPubKeyOf"];

export function createSmplxProgramCompiler(
	smplx: Pick<SmplxWasmModule, "Program">,
): CompileProgram {
	return ({ argumentsJson, extraLeavesJson, includeDebugSymbols, network, source }) => {
		const program = new smplx.Program(source, argumentsJson, extraLeavesJson, includeDebugSymbols);

		try {
			return {
				address: program.trAddress(network),
				cmr: program.cmr(),
				scriptPubKeyHex: program.scriptPubkey(network),
				tapleafHash: program.tapleafHash(),
			};
		} finally {
			program.free();
		}
	};
}

export function createSmplxScriptPubKeyCompiler(
	smplx: Pick<SmplxWasmModule, "Program">,
	network: string,
): CompileScriptPubKey {
	return ({ argumentsJson, extraLeavesJson, includeDebugSymbols, source }) => {
		const program = new smplx.Program(source, argumentsJson, extraLeavesJson, includeDebugSymbols);

		try {
			return program.scriptPubkey(network);
		} finally {
			program.free();
		}
	};
}

export function createSmplxProgramAbi(smplx: Pick<SmplxWasmModule, "Program">): ProgramAbiOf {
	return (source) => {
		const answered: unknown = JSON.parse(smplx.Program.abi(source));
		const { parameters, witnesses } = (answered ?? {}) as Record<string, unknown>;

		return {
			parameters: typesOf(parameters, "parameter"),
			witnesses: typesOf(witnesses, "witness"),
		};
	};
}

function typesOf(answered: unknown, kind: string): Record<string, string> {
	if (typeof answered !== "object" || answered === null || Array.isArray(answered)) {
		throw new TypeError(
			`the compiler did not report this contract's ${kind} types as a set of names.`,
		);
	}

	for (const [name, type] of Object.entries(answered)) {
		if (typeof type !== "string") {
			throw new TypeError(
				`the compiler reported the type of ${kind} ${name} as ${JSON.stringify(type)}, which does ` +
					"not name a type.",
			);
		}
	}

	return answered as Record<string, string>;
}
