import type { Manifest } from "../document/manifest";
import type { ProgramReference } from "../document/schema";
import { Refusal } from "../refusal";
import type { Scope } from "../values/scope";
import { resolveCompileParams } from "./compileParams";
import type { ProgramAbi, ProgramParamTypes } from "./programParamTypes";
import { stateLeavesOf } from "./stateLeaves";
import { bindUtxoParams, boundWiring } from "./utxoParams";

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

export type ProgramAbiOf = (source: string) => Promise<ProgramAbi> | ProgramAbi;

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
	witnessTypes: Record<string, string>;
};

export async function deriveProgramAddress(
	manifest: Manifest,
	input: {
		compile: CompileProgram;
		programAbi: ProgramAbiOf;
		contractSources: Record<string, string>;
		declaredTypes: Record<string, string>;
		includeDebugSymbols: boolean;
		network: string;
		reference: ProgramReference;
		scope: Scope;
	},
): Promise<ProgramDerivation> {
	const utxoType = input.reference.utxo_type;
	const declared = manifest.utxoType(utxoType);

	if (!declared) {
		throw new Refusal(`The manifest declares no utxo type named "${utxoType}".`);
	}

	const { script } = declared;
	const sourcePath = script.source;
	const source = input.contractSources[sourcePath];

	if (source === undefined) {
		throw new Refusal(`The source of ${sourcePath} was not supplied.`);
	}

	let abi: ProgramAbi;

	try {
		abi = await input.programAbi(source);
	} catch (error) {
		throw new Refusal(`The contract at ${sourcePath} did not compile: ${String(error)}`);
	}

	const declaring = { declares: abi.parameters, source: sourcePath };
	const bound = bindUtxoParams(utxoType, declared, input.reference, input.scope);
	const scope = bound?.scope ?? input.scope;
	const wiring = bound
		? { ...boundWiring(bound, declaring.declares), ...script.compile_params }
		: {
				...instanceFieldsNamed(declaring.declares, input.scope.instance),
				...script.compile_params,
				...input.reference.compile_params,
			};
	const argumentsJson = JSON.stringify(
		resolveCompileParams(wiring, bound?.types ?? input.declaredTypes, scope, declaring),
	);
	const extraLeavesJson = JSON.stringify(
		stateLeavesOf(script.extra_leaves, { at: `Utxo type "${utxoType}"`, scope }),
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
			utxoType,
			witnessTypes: abi.witnesses,
		};
	} catch (error) {
		throw new Refusal(`The contract at ${sourcePath} did not compile: ${String(error)}`);
	}
}

function instanceFieldsNamed(
	declares: ProgramParamTypes,
	instance: Record<string, unknown> | undefined,
): Record<string, string> {
	return Object.fromEntries(
		Object.keys(declares)
			.filter((name) => instance !== undefined && Object.hasOwn(instance, name))
			.map((name) => [name, name]),
	);
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
