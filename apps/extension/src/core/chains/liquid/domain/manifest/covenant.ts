import { resolveCompileParams } from "./compileParams";
import { asRecord } from "./json";
import type { NormalisationNote, NormalisedManifest } from "./normalise";
import type { ReferenceScope } from "./references";

/**
 * Compiles a covenant and reports the address it derives.
 *
 * The caller supplies the compile step, so this can be exercised without a wasm module
 * and so the module's lifecycle stays where it belongs.
 */
export type CompileCovenant = (input: {
	argumentsJson: string;
	network: string;
	source: string;
}) => Promise<string> | string;

export type CovenantDerivation = {
	/** The address the wallet derived by rebuilding the contract itself. */
	address: string;
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
		contractSources: Record<string, string>;
		declaredTypes: Record<string, string>;
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

	const params = resolveCompileParams(wiring, input.declaredTypes, input.scope, input.notes);

	if (!params.ok) {
		return params;
	}

	const argumentsJson = JSON.stringify(params.arguments);

	try {
		const address = await input.compile({
			argumentsJson,
			network: input.network,
			source,
		});

		return {
			derivation: { address, argumentsJson, source, utxoType: input.utxoType },
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
 * Whether a covenant UTXO is what the manifest claims: does the address the wallet
 * derived match the one the funds are actually sitting at?
 *
 * `onChainAddress` must come from the chain, never from the request. Comparing two
 * values the same site supplied would pass for any pair it chose to make consistent.
 * The state file carries an outpoint and no address precisely because the address has
 * to be read rather than told.
 *
 * A mismatch is a refusal. There is no shape of this function that returns a warning.
 */
export function covenantMatchesChain(
	derivation: CovenantDerivation,
	onChainAddress: string,
): { matched: true } | { matched: false; reason: string } {
	if (derivation.address === onChainAddress) {
		return { matched: true };
	}

	return {
		matched: false,
		reason:
			`The ${derivation.utxoType} contract rebuilds to ${derivation.address}, ` +
			`but the funds are at ${onChainAddress}. This is not the contract the site described.`,
	};
}
