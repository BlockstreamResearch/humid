import type { ParsedLiquidProcessCtParams } from "../request/request";

/**
 * A contract's compile-time parameters, in SimplicityHL's own argument JSON shape.
 *
 * Kept as the compiler's format rather than a shape of our own so the value that reaches
 * compilation is the value the compiler documents, with nothing translating in between.
 */
export type ContractArguments = Record<string, { type: string; value: string }>;

export type ResolveCompileParamsResult =
	| { arguments: ContractArguments; ok: true }
	| { ok: false; reason: string };

/**
 * The manifest's declared parameter types, mapped to the compiler's.
 *
 * Deliberately a closed list: a type nobody has mapped is refused rather than passed
 * through, because a wrong type here produces a valid-looking wrong address rather than
 * an error. The corpus's remaining types — the integer widths, `bytes32`,
 * `liquid.asset_id` and `address` — arrive with the slices that need them.
 */
const PARAM_TYPES: Record<string, string> = {
	pubkey: "Pubkey",
};

/**
 * Resolves the compile-time parameters a contract is built with, from the manifest's
 * wiring and the parameters the request filled.
 *
 * The wiring lives in `compile_params`, a map of the contract's parameter name to a
 * reference — `{"PUB_KEY": "params.pubkey"}`. Note the collision the format carries:
 * `compile_params` is both this wiring map and a deprecated namespace prefix for
 * references. This reads the wiring; the namespace is a later slice's problem.
 *
 * Scope: resolves `params.` references only. Instance references, computed values and
 * formulas belong to the slices that own them, and are refused here rather than silently
 * mishandled.
 *
 * Everything it cannot resolve refuses rather than resolving to something plausible. That
 * strictness is the point — these values participate in the address, so a wrong one produces
 * a well-formed address for the wrong contract instead of an error.
 */
export function resolveCompileParams(
	request: ParsedLiquidProcessCtParams,
	wiring: Record<string, unknown>,
	declaredTypes: Record<string, string>,
): ResolveCompileParamsResult {
	const resolved: ContractArguments = {};

	for (const [name, reference] of Object.entries(wiring)) {
		if (typeof reference !== "string") {
			return { ok: false, reason: `Compile parameter ${name} is not a reference.` };
		}

		const paramName = referencedParam(reference);

		if (!paramName) {
			return {
				ok: false,
				reason: `Compile parameter ${name} references ${reference}, which this runtime does not resolve yet.`,
			};
		}

		const value = request.params[paramName];

		if (typeof value !== "string") {
			return {
				ok: false,
				reason: `Compile parameter ${name} needs parameter ${paramName}, which the request did not supply as a value.`,
			};
		}

		const declaredType = declaredTypes[paramName];
		const compilerType = declaredType ? PARAM_TYPES[declaredType] : undefined;

		if (!compilerType) {
			return {
				ok: false,
				reason: `Parameter ${paramName} is declared as ${declaredType ?? "an unstated type"}, which this runtime does not encode yet.`,
			};
		}

		resolved[name] = { type: compilerType, value: withHexPrefix(value) };
	}

	return { arguments: resolved, ok: true };
}

/**
 * The action parameter a reference points at, or undefined when it points elsewhere.
 *
 * Accepts the `$`-prefixed spelling alongside the bare one: the corpus carries both, and
 * `lending` uses one where `lending_v2` uses the other.
 */
function referencedParam(reference: string): string | undefined {
	return /^\$?params\.(?<name>[A-Za-z0-9_]+)$/.exec(reference)?.groups?.name;
}

function withHexPrefix(value: string): string {
	return value.startsWith("0x") ? value : `0x${value}`;
}
