import { asRecord } from "../document/json";
import type { NormalisedManifest } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { Refusal } from "../refusal";
import { resolveCompileParams } from "./compileParams";
import type { CovenantParamTypes } from "./covenantParamTypes";
import { stateLeavesOf } from "./stateLeaves";

export type CompiledCovenant = {
	address: string;
	cmr: string;
	scriptPubKeyHex: string;
	tapleafHash: string;
};

export type CompileCovenant = (input: {
	argumentsJson: string;
	extraLeavesJson: string;
	includeDebugSymbols: boolean;
	network: string;
	source: string;
}) => Promise<CompiledCovenant> | CompiledCovenant;

export type CovenantParamTypesOf = (
	source: string,
) => Promise<CovenantParamTypes> | CovenantParamTypes;

export type CovenantDerivation = {
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

export async function deriveCovenantAddress(
	manifest: NormalisedManifest,
	input: {
		compile: CompileCovenant;
		covenantParamTypes?: CovenantParamTypesOf;
		contractSources: Record<string, string>;
		declaredTypes: Record<string, string>;
		includeDebugSymbols: boolean;
		network: string;
		scope: ReferenceScope;
		utxoType: string;
		wiring: Record<string, unknown>;
	},
): Promise<CovenantDerivation> {
	const declared = asRecord(manifest.utxoTypes[input.utxoType]);

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

	let declaring: { declares: CovenantParamTypes; source: string } | undefined;

	if (input.covenantParamTypes) {
		try {
			declaring = { declares: await input.covenantParamTypes(source), source: sourcePath };
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

export function checkCovenantOnChain(
	derivation: CovenantDerivation,
	onChainScriptPubKeyHex: string,
): void {
	if (derivation.scriptPubKeyHex.toLowerCase() !== onChainScriptPubKeyHex.toLowerCase()) {
		throw new Refusal(
			`The ${derivation.utxoType} contract rebuilds to ${derivation.address}, ` +
				"but the funds are locked by a different contract. " +
				"This is not the contract the site described.",
			"covenant-mismatch",
		);
	}
}
