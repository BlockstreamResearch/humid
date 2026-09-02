import { asRecord } from "../document/json";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { resolveCompileParams } from "./compileParams";

/**
 * What one compile yields: where the covenant is, in both forms a wallet needs.
 *
 * Both come from the same compiled contract rather than from two calls, because they are two
 * spellings of one fact. Deriving them separately is how an output comes to be paid to a
 * bech32 string — what pays a covenant is a scriptPubKey, and an address is not hex.
 */
export type CompiledCovenant = {
	/** What a person is shown. */
	address: string;
	/** What an output actually pays to, and what the chain is compared against. */
	scriptPubKeyHex: string;
};

/**
 * Compiles a covenant and reports where it lands.
 *
 * The caller supplies the compile step, so this can be exercised without a wasm module and so
 * the module's lifecycle stays where it belongs — with the wallet, not with this package.
 */
export type CompileCovenant = (input: {
	argumentsJson: string;
	network: string;
	source: string;
}) => Promise<CompiledCovenant> | CompiledCovenant;

export type CovenantDerivation = {
	/** The address the wallet derived by rebuilding the contract itself. */
	address: string;
	/** The same covenant as an output pays it, from the same compile. */
	scriptPubKeyHex: string;
	/** The manifest's name for the kind of UTXO this is. */
	utxoType: string;
};

export type DeriveCovenantResult =
	| { derivation: CovenantDerivation; ok: true }
	| { ok: false; reason: string };

/**
 * Derives one covenant UTXO type, from the contract source the request supplied and the
 * parameters the manifest wires into it.
 *
 * This is the wallet establishing a fact for itself. Nothing the site says about where the
 * funds are is consulted; the site's contribution is the source text and the parameter
 * values, and both change what is derived rather than what it is checked against.
 */
export async function deriveCovenantAddress(
	request: ParsedLiquidProcessCtParams,
	input: {
		compile: CompileCovenant;
		declaredTypes: Record<string, string>;
		network: string;
		utxoType: string;
		wiring: Record<string, unknown>;
	},
): Promise<DeriveCovenantResult> {
	const declared = asRecord(asRecord(request.manifest.utxo_types)?.[input.utxoType]);

	if (!declared) {
		return { ok: false, reason: `The manifest declares no utxo type named "${input.utxoType}".` };
	}

	const sourcePath = asRecord(declared.script)?.source;

	if (typeof sourcePath !== "string") {
		return { ok: false, reason: `Utxo type "${input.utxoType}" names no contract source.` };
	}

	const source = request.contractSources[sourcePath];

	if (source === undefined) {
		return { ok: false, reason: `The source of ${sourcePath} was not supplied.` };
	}

	const params = resolveCompileParams(request, input.wiring, input.declaredTypes);

	if (!params.ok) {
		return params;
	}

	try {
		const compiled = await input.compile({
			argumentsJson: JSON.stringify(params.arguments),
			network: input.network,
			source,
		});

		return {
			derivation: {
				address: compiled.address,
				scriptPubKeyHex: compiled.scriptPubKeyHex,
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
 * Whether a covenant UTXO is what the manifest claims: does the script the wallet derived
 * match the one the funds are actually locked by?
 *
 * `onChainScriptPubKeyHex` must come from the chain, never from the request. Comparing two
 * values the same site supplied would pass for any pair it chose to make consistent. The
 * state file carries an outpoint and no script precisely because the script has to be read
 * rather than told.
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
