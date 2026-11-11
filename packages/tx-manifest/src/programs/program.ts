import { asRecord } from "../document/json";
import type { Manifest } from "../document/manifest";
import type { ReferenceScope } from "../document/references";
import { Refusal } from "../refusal";
import { resolveCompileParams } from "./compileParams";
import type { ProgramParamTypes } from "./programParamTypes";
import { stateLeavesOf } from "./stateLeaves";

export type CompiledProgram = {
	address: string;
	cmr: string;
	scriptPubKeyHex: string;
	tapleafHash: string;
};

export type CompileProgram = (input: {
	argumentsJson: string;
	extraLeavesJson: string;
	includeDebugSymbols: boolean;
	network: string;
	source: string;
}) => Promise<CompiledProgram> | CompiledProgram;

export type ProgramParamTypesOf = (
	source: string,
) => Promise<ProgramParamTypes> | ProgramParamTypes;

export type ProgramDerivation = {
	address: string;
	argumentsJson: string;
	cmr: string;
	extraLeavesJson: string;
	includeDebugSymbols: boolean;
	scriptPubKeyHex: string;
	source: string;
	sourcePath: string;
	tapleafHash: string;
	utxoType: string;
};

export async function deriveProgramAddress(
	manifest: Manifest,
	input: {
		compile: CompileProgram;
		programParamTypes?: ProgramParamTypesOf;
		contractSources: Record<string, string>;
		declaredTypes: Record<string, string>;
		includeDebugSymbols: boolean;
		network: string;
		scope: ReferenceScope;
		utxoType: string;
		wiring: Record<string, unknown>;
	},
): Promise<ProgramDerivation> {
	const declared = manifest.utxoType(input.utxoType);

	if (!declared) {
		throw new Refusal(`The manifest declares no utxo type named "${input.utxoType}".`);
	}

	const script = asRecord(declared.script);
	const sourcePath = script?.source;

	if (typeof sourcePath !== "string") {
		throw new Refusal(`Utxo type "${input.utxoType}" names no contract source.`);
	}

	const source = input.contractSources[sourcePath];

	if (source === undefined) {
		throw new Refusal(`The source of ${sourcePath} was not supplied.`);
	}

	const wiring = { ...asRecord(script?.compile_params), ...input.wiring };

	let declaring: { declares: ProgramParamTypes; source: string } | undefined;

	if (input.programParamTypes) {
		try {
			declaring = { declares: await input.programParamTypes(source), source: sourcePath };
		} catch (error) {
			throw new Refusal(`The contract at ${sourcePath} did not compile: ${String(error)}`);
		}
	}

	const argumentsJson = JSON.stringify(
		resolveCompileParams(wiring, input.declaredTypes, input.scope, declaring),
	);
	const extraLeavesJson = JSON.stringify(
		stateLeavesOf(script?.extra_leaves, {
			at: `Utxo type "${input.utxoType}"`,
			scope: input.scope,
		}),
	);

	try {
		const compiled = await input.compile({
			argumentsJson,
			extraLeavesJson,
			includeDebugSymbols: input.includeDebugSymbols,
			network: input.network,
			source,
		});

		return {
			address: compiled.address,
			argumentsJson,
			cmr: compiled.cmr,
			extraLeavesJson,
			includeDebugSymbols: input.includeDebugSymbols,
			scriptPubKeyHex: compiled.scriptPubKeyHex,
			source,
			sourcePath,
			tapleafHash: compiled.tapleafHash,
			utxoType: input.utxoType,
		};
	} catch (error) {
		throw new Refusal(`The contract at ${sourcePath} did not compile: ${String(error)}`);
	}
}

export function checkProgramOnChain(
	derivation: ProgramDerivation,
	onChainScriptPubKeyHex: string,
): void {
	if (derivation.scriptPubKeyHex.toLowerCase() !== onChainScriptPubKeyHex.toLowerCase()) {
		throw new Refusal(
			`The ${derivation.utxoType} contract rebuilds to ${derivation.address}, ` +
				"but the funds are locked by a different contract. " +
				"This is not the contract the site described.",
			"program-mismatch",
		);
	}
}
