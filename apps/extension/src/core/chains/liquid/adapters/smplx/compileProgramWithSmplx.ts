import type { reviewManifestAction } from "@humid/tx-manifest";

import type { SmplxWasmModule } from "./loadSmplxWasm";

type ReviewInput = Parameters<typeof reviewManifestAction>[1];
type CompileProgram = ReviewInput["compile"];
type ProgramParamTypesOf = NonNullable<ReviewInput["programParamTypes"]>;
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

export function createSmplxProgramParamTypes(
	smplx: Pick<SmplxWasmModule, "programArgumentTypes">,
): ProgramParamTypesOf {
	return (source) => {
		const answered: unknown = JSON.parse(smplx.programArgumentTypes(source));

		if (typeof answered !== "object" || answered === null || Array.isArray(answered)) {
			throw new TypeError(
				"the compiler did not report this contract's parameter types as a set of names.",
			);
		}

		const declared: Record<string, string> = {};

		for (const [name, type] of Object.entries(answered)) {
			if (typeof type !== "string") {
				throw new TypeError(
					`the compiler reported the type of ${name} as ${JSON.stringify(type)}, which does ` +
						"not name a type.",
				);
			}

			declared[name] = type;
		}

		return declared;
	};
}
