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
	// The deployed lending contracts take these: `asset_auth` a burn flag, `asset_auth_vault`
	// three of them. A manifest wiring a value into one is refused without an encoding for it,
	// so the corpus's own contracts are what say this is needed.
	bool: "bool",
	// A covenant script hash is thirty-two bytes. `u256` rather than one of the compiler's
	// aliases because they are the same type: `Pubkey`, `Message`, `Scalar`, `Fe`,
	// `ExplicitAsset` and `ExplicitNonce` all resolve to `U256` in simplicityhl 0.6.0
	// (`src/types.rs` L863-865), so the encoded value does not depend on which name a
	// contract happens to use for it.
	bytes32: "u256",
	pubkey: "Pubkey",
};

/**
 * How many bytes a declared type occupies, for the types that have a fixed width.
 *
 * A value of the wrong width does not fail here without this — it is hex-prefixed and
 * handed to the compiler, which rejects it somewhere inside its own parser with a
 * message about the parse position. That is a true error about the wrong thing: the
 * fault is in the request, not the contract, and a person reading "expected end of
 * input at line 1 column 143" has to work backwards to find out that they pasted an
 * address where a key belongs.
 */
const PARAM_BYTES: Record<string, number> = {
	bytes32: 32,
	pubkey: 32,
};

/** What a type of fixed width should look like, for a refusal that can be acted on. */
const SHAPES: Record<string, string> = {
	bytes32: "32 bytes as 64 hexadecimal characters",
	pubkey: "an x-only public key: 32 bytes as 64 hexadecimal characters, no prefix and no address",
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

		const width = PARAM_BYTES[declaredType ?? ""];

		if (width !== undefined) {
			const malformed = wrongWidth(found.value, width, declaredType ?? "", name, reference);

			if (malformed) {
				return { ok: false, reason: malformed };
			}
		}

		// A boolean is written as itself rather than as bytes: the compiler reads `true` and
		// `false`, and a hex-prefixed one is not an expression of that type.
		resolved[name] =
			compilerType === "bool"
				? { type: compilerType, value: booleanLiteral(found.value) }
				: { type: compilerType, value: withHexPrefix(found.value) };
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

/**
 * A boolean as the compiler writes it.
 *
 * Anything other than the two words it reads is passed through unchanged, so a manifest
 * carrying something else is refused by the compiler naming the type rather than being
 * quietly turned into `false` — which is a different covenant.
 */
function booleanLiteral(value: string): string {
	return value === "1" ? "true" : value === "0" ? "false" : value;
}

function withHexPrefix(value: string): string {
	return value.startsWith("0x") ? value : `0x${value}`;
}

/**
 * Whether a value can be what its declared type says, by shape alone.
 *
 * It says which compile parameter, which reference, what arrived and what was needed,
 * because all four are things the person filling the request can act on and none of
 * them survives into the compiler's own message.
 */
function wrongWidth(
	value: string,
	bytes: number,
	declaredType: string,
	name: string,
	reference: string,
): string | undefined {
	const digits = value.startsWith("0x") ? value.slice(2) : value;

	if (digits.length === bytes * 2 && /^[0-9a-fA-F]+$/.test(digits)) {
		return undefined;
	}

	const found = /^[0-9a-fA-F]*$/.test(digits)
		? `${digits.length} hexadecimal characters`
		: `"${value.length > 24 ? `${value.slice(0, 24)}…` : value}"`;

	return `${name} is wired to ${reference}, declared ${declaredType}, which is ${SHAPES[declaredType] ?? `${bytes} bytes`}. Got ${found}.`;
}
