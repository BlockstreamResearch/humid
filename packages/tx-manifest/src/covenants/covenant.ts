import { asRecord } from "../document/json";
import type { NormalisationNote, NormalisedManifest } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { resolveCompileParams } from "./compileParams";
import type { ContractParamTypes } from "./contractParamTypes";
import { encodeExtraLeaves } from "./extraLeaves";

/**
 * Compiles a covenant and reports the address it derives.
 *
 * The caller supplies the compile step, so this can be exercised without a wasm module
 * and so the module's lifecycle stays where it belongs.
 */
export type CompileCovenant = (input: {
	argumentsJson: string;
	/** Already-encoded taproot leaf payloads, appended to the tree in declaration order. */
	extraLeavesJson: string;
	/** The mode this protocol declares its contracts were built in. */
	includeDebugSymbols: boolean;
	network: string;
	source: string;
}) => Promise<CompiledCovenant> | CompiledCovenant;

/**
 * What a contract says the types of its own compile parameters are.
 *
 * Supplied the same way the compile step is, and for the same reason: the answer comes from the
 * compiler, and the compiler's lifecycle belongs to the wallet rather than to this package.
 *
 * It is separate from compiling because it is needed *before* a compile — a parameter written
 * as a bare value has no type until the contract states one, and the arguments a compile takes
 * cannot be built until it does. Asking a compiled contract instead would be circular.
 */
export type ContractParamTypesOf = (
	source: string,
) => Promise<ContractParamTypes> | ContractParamTypes;

/**
 * What one compile yields: where the covenant is, in both forms a transaction needs.
 *
 * Both come from the same compiled contract rather than from two calls, because they are
 * two spellings of one fact. Deriving them separately is how an output came to be paid
 * to a bech32 string — the transaction builder takes a scriptPubKey and hex-decodes it,
 * and an address is not hex.
 */
export type CompiledCovenant = {
	/** What a person is shown, and what an on-chain output is compared against. */
	address: string;
	/** What an output actually pays to. */
	scriptPubKeyHex: string;
};

export type CovenantDerivation = {
	/** The address the wallet derived by rebuilding the contract itself. */
	address: string;
	/** The same covenant as an output pays it, from the same compile. */
	scriptPubKeyHex: string;
	/** The extra taproot leaves it was built with, encoded. */
	extraLeavesJson: string;
	/**
	 * The parameters it was built with, in the compiler's own shape.
	 *
	 * Carried out so anything spending this covenant rebuilds it from exactly what was
	 * verified, rather than resolving the request a second time and hoping the two agree.
	 */
	argumentsJson: string;
	/** The contract source it was built from. */
	source: string;
	/** The manifest's name for the kind of UTXO this is. */
	utxoType: string;
};

export type DeriveCovenantResult =
	| { derivation: CovenantDerivation; ok: true }
	| { ok: false; reason: string };

/**
 * Derives the address of one covenant UTXO type, from the contract source the request
 * supplied and the parameters the manifest wires into it.
 *
 * This is the wallet establishing a fact for itself. Nothing the site says about where
 * the funds are is consulted; the site's contribution is the source text and the
 * parameter values, and both change what is derived rather than what it is checked
 * against.
 */
export async function deriveCovenantAddress(
	manifest: NormalisedManifest,
	input: {
		compile: CompileCovenant;
		/** What the contract itself declares, for the parameters a deployment writes as values. */
		contractParamTypes?: ContractParamTypesOf;
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

	const sourcePath = asRecord(declared.script)?.source;

	if (typeof sourcePath !== "string") {
		return { ok: false, reason: `Utxo type "${input.utxoType}" names no contract source.` };
	}

	const source = input.contractSources[sourcePath];

	if (source === undefined) {
		return { ok: false, reason: `The source of ${sourcePath} was not supplied.` };
	}

	// The wiring at the site the covenant is named from, layered over the wiring the utxo
	// type declares for itself — the site is more specific, so it wins.
	const wiring = {
		...asRecord(asRecord(declared.script)?.compile_params),
		...input.wiring,
	};

	// Read before resolving, because what the contract declares is what decides the parameters
	// the document writes as values. A contract that will not analyse is reported the way one
	// that will not compile is: it is the same failure, found one step earlier.
	let declaring: { declares: ContractParamTypes; source: string } | undefined;

	if (input.contractParamTypes) {
		try {
			declaring = { declares: await input.contractParamTypes(source), source: sourcePath };
		} catch (error) {
			return {
				ok: false,
				reason: `The contract at ${sourcePath} did not compile: ${String(error)}`,
			};
		}
	}

	const params = resolveCompileParams(
		wiring,
		input.declaredTypes,
		input.scope,
		input.notes,
		declaring,
	);

	if (!params.ok) {
		return params;
	}

	const leaves = encodeExtraLeaves(asRecord(declared.script)?.extra_leaves, {
		notes: input.notes,
		scope: input.scope,
		stateVars: asRecord(declared.state_vars) ?? {},
	});

	if (!leaves.ok) {
		return { ok: false, reason: `Utxo type "${input.utxoType}": ${leaves.reason}` };
	}

	const argumentsJson = JSON.stringify(params.arguments);
	const extraLeavesJson = JSON.stringify(leaves.hex);

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
				scriptPubKeyHex: compiled.scriptPubKeyHex,
				source,
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

/**
 * Whether a covenant UTXO is what the manifest claims: does the script the wallet
 * derived match the one the funds are actually locked by?
 *
 * `onChainScriptPubKeyHex` must come from the chain, never from the request. Comparing two
 * values the same site supplied would pass for any pair it chose to make consistent.
 * The state file carries an outpoint and no script precisely because the script has
 * to be read rather than told.
 *
 * The comparison is over the script rather than the address it is written as. The script is
 * the locking condition itself; an address is one rendering of it, and rendering is where a
 * difference can hide — the same script has a different address on a different network, and
 * two spellings of one address are not equal as strings.
 *
 * A mismatch is a refusal. There is no shape of this function that returns a warning.
 */
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
