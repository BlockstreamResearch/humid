import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedManifest } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { resolveCompileParams } from "./compileParams";
import type { CovenantParamTypes } from "./covenantParamTypes";

export type CompiledCovenant = {
	address: string;
	scriptPubKeyHex: string;
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
	extraLeavesJson: string;
	includeDebugSymbols: boolean;
	scriptPubKeyHex: string;
	source: string;
	sourcePath: string;
	utxoType: string;
};

export type DeriveCovenantResult =
	| { derivation: CovenantDerivation; ok: true }
	| { ok: false; reason: string };

export async function deriveCovenantAddress(
	manifest: NormalisedManifest,
	input: {
		compile: CompileCovenant;
		covenantParamTypes?: CovenantParamTypesOf;
		contractSources: Record<string, string>;
		declaredTypes: Record<string, string>;
		includeDebugSymbols: boolean;
		network: string;
		notes?: NormalisationNote[];
		scope: ReferenceScope;
		utxoType: string;
		wiring: Record<string, unknown>;
	},
): Promise<DeriveCovenantResult> {
	const declared = asRecord(manifest.utxoTypes[input.utxoType]);

	if (!declared) {
		return { ok: false, reason: `The manifest declares no utxo type named "${input.utxoType}".` };
	}

	const script = asRecord(declared.script);
	const sourcePath = script?.source;

	if (typeof sourcePath !== "string") {
		return { ok: false, reason: `Utxo type "${input.utxoType}" names no contract source.` };
	}

	const source = input.contractSources[sourcePath];

	if (source === undefined) {
		return { ok: false, reason: `The source of ${sourcePath} was not supplied.` };
	}

	if (asArray(script?.extra_leaves).length > 0) {
		return {
			ok: false,
			reason: `Utxo type "${input.utxoType}" declares extra_leaves, which this runtime does not encode yet.`,
		};
	}

	const wiring = { ...asRecord(script?.compile_params), ...input.wiring };

	let declaring: { declares: CovenantParamTypes; source: string } | undefined;

	if (input.covenantParamTypes) {
		try {
			declaring = { declares: await input.covenantParamTypes(source), source: sourcePath };
		} catch (error) {
			return {
				ok: false,
				reason: `The contract at ${sourcePath} did not compile: ${String(error)}`,
			};
		}
	}

	const params = resolveCompileParams(wiring, input.declaredTypes, input.scope, declaring);

	if (!params.ok) {
		return params;
	}

	const argumentsJson = JSON.stringify(params.arguments);
	const extraLeavesJson = "[]";

	try {
		const compiled = await input.compile({
			argumentsJson,
			extraLeavesJson,
			includeDebugSymbols: input.includeDebugSymbols,
			network: input.network,
			source,
		});

		return {
			derivation: {
				address: compiled.address,
				argumentsJson,
				extraLeavesJson,
				includeDebugSymbols: input.includeDebugSymbols,
				scriptPubKeyHex: compiled.scriptPubKeyHex,
				source,
				sourcePath,
				utxoType: input.utxoType,
			},
			ok: true,
		};
	} catch (error) {
		return {
			ok: false,
			reason: `The contract at ${sourcePath} did not compile: ${String(error)}`,
		};
	}
}

export function covenantMatchesChain(
	derivation: CovenantDerivation,
	onChainScriptPubKeyHex: string,
): { matched: true } | { matched: false; reason: string } {
	if (derivation.scriptPubKeyHex.toLowerCase() === onChainScriptPubKeyHex.toLowerCase()) {
		return { matched: true };
	}

	return {
		matched: false,
		reason:
			`The ${derivation.utxoType} contract rebuilds to ${derivation.address}, ` +
			"but the funds are locked by a different contract. " +
			"This is not the contract the site described.",
	};
}
