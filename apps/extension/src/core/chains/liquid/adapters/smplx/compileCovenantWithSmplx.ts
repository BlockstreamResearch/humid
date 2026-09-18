import type { reviewManifestAction } from "@humid/tx-manifest";

import type { SmplxWasmModule } from "./loadSmplxWasm";

type ReviewInput = Parameters<typeof reviewManifestAction>[1];
type CompileCovenant = ReviewInput["compile"];
type CovenantParamTypesOf = NonNullable<ReviewInput["covenantParamTypes"]>;
type CompileScriptPubKey = ReviewInput["scriptPubKeyOf"];

export function createSmplxCovenantCompiler(
	smplx: Pick<SmplxWasmModule, "Covenant">,
): CompileCovenant {
	return ({ argumentsJson, extraLeavesJson, includeDebugSymbols, network, source }) => {
		const covenant = new smplx.Covenant(
			source,
			argumentsJson,
			extraLeavesJson,
			includeDebugSymbols,
		);

		try {
			return {
				address: covenant.address(network),
				cmr: covenant.commitmentMerkleRoot(),
				scriptPubKeyHex: covenant.scriptPubKeyHex(network),
				tapleafHash: covenant.tapleafHash(),
			};
		} finally {
			covenant.free();
		}
	};
}

export function createSmplxScriptPubKeyCompiler(
	smplx: Pick<SmplxWasmModule, "Covenant">,
	network: string,
): CompileScriptPubKey {
	return ({ argumentsJson, extraLeavesJson, includeDebugSymbols, source }) => {
		const covenant = new smplx.Covenant(
			source,
			argumentsJson,
			extraLeavesJson,
			includeDebugSymbols,
		);

		try {
			return covenant.scriptPubKeyHex(network);
		} finally {
			covenant.free();
		}
	};
}

export function createSmplxCovenantParamTypes(
	smplx: Pick<SmplxWasmModule, "covenantParameterTypes">,
): CovenantParamTypesOf {
	return (source) => {
		const answered: unknown = JSON.parse(smplx.covenantParameterTypes(source));

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
