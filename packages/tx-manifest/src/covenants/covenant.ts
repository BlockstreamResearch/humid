import { asRecord } from "../document/json";
import type { NormalisationNote, NormalisedManifest } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { resolveCompileParams } from "./compileParams";
import type { CovenantParamTypes } from "./covenantParamTypes";
import { encodeStateLeaves } from "./stateLeaves";

export type CompiledCovenant = {
	address: string;
	/**
	 * The Commitment Merkle Root, identifying the program itself.
	 *
	 * The address answers where the funds sit, and moves with the arguments the contract was
	 * compiled against and with the network it was compiled for. This answers what the contract is,
	 * and does not.
	 */
	cmr: string;
	scriptPubKeyHex: string;
	/**
	 * The tapleaf hash, identifying the leaf the program sits in.
	 *
	 * This is what a taproot spend commits to and what a signature over the input covers, so it is
	 * the half of a contract's identity that says where it is being spent from rather than what it
	 * is.
	 */
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

	const stateLeaves = encodeStateLeaves(script?.extra_leaves, {
		at: `Utxo type "${input.utxoType}"`,
		...(input.notes === undefined ? {} : { notes: input.notes }),
		scope: input.scope,
	});

	if (!stateLeaves.ok) {
		return { ok: false, reason: stateLeaves.reason };
	}

	const argumentsJson = JSON.stringify(params.arguments);
	const extraLeavesJson = JSON.stringify(stateLeaves.leaves);

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
				cmr: compiled.cmr,
				extraLeavesJson,
				includeDebugSymbols: input.includeDebugSymbols,
				scriptPubKeyHex: compiled.scriptPubKeyHex,
				source,
				sourcePath,
				tapleafHash: compiled.tapleafHash,
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
