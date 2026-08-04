import type { NormalisationNote } from "./normalise";
import { type ReferenceScope, resolveReference } from "./references";

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
 * wiring and what the request and the deployment supply.
 *
 * The wiring lives in `compile_params`, a map of the contract's parameter name to a
 * reference — `{"PUB_KEY": "params.pubkey"}`. Note the collision the format carries:
 * `compile_params` is both this wiring map and a deprecated namespace prefix for
 * references. This map is read as wiring; a reference inside it is resolved at the
 * compile-parameter site, which is what decides that `instance.`, `params.`, `args.` and a
 * bare name are meaningful here and the fee is not.
 */
export function resolveCompileParams(
	wiring: Record<string, unknown>,
	declaredTypes: Record<string, string>,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): ResolveCompileParamsResult {
	const resolved: ContractArguments = {};

	for (const [name, reference] of Object.entries(wiring)) {
		if (typeof reference !== "string") {
			return { ok: false, reason: `Compile parameter ${name} is not a reference.` };
		}

		const found = resolveReference(reference, "compileParam", scope, notes);

		if (!found.ok) {
			return { ok: false, reason: `Compile parameter ${name}: ${found.reason}` };
		}

		if (typeof found.value !== "string") {
			return {
				ok: false,
				reason: `Compile parameter ${name} resolves to ${reference}, which is not a value this runtime can encode yet.`,
			};
		}

		// A compile parameter's type comes from the parameter the manifest declares, so a
		// reference to something with no declared type has nothing to encode against.
		const declaredType = declaredTypeOf(reference, declaredTypes);
		const compilerType = declaredType ? PARAM_TYPES[declaredType] : undefined;

		if (!compilerType) {
			return {
				ok: false,
				reason: `${reference} is declared as ${declaredType ?? "an unstated type"}, which this runtime does not encode yet.`,
			};
		}

		resolved[name] = { type: compilerType, value: withHexPrefix(found.value) };
	}

	return { arguments: resolved, ok: true };
}

/**
 * The declared type of whatever a reference points at.
 *
 * Only the action's own parameters carry declared types today. An instance field or an
 * argument has none, which is why a reference to one is refused here rather than encoded
 * on a guess — encoding a value at the wrong width changes the address silently.
 */
function declaredTypeOf(
	reference: string,
	declaredTypes: Record<string, string>,
): string | undefined {
	const name = /^\$?(?:params\.)?(?<name>[A-Za-z_][A-Za-z0-9_]*)$/.exec(reference)?.groups?.name;

	return name === undefined ? undefined : declaredTypes[name];
}

function withHexPrefix(value: string): string {
	return value.startsWith("0x") ? value : `0x${value}`;
}
