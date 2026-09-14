import type { NormalisationNote } from "../document/normalise";
import { parseReference, type ReferenceScope, resolveReference } from "../document/references";
import { type DeclaringContract, encodeContractLiteral } from "./contractParamTypes";
import { encodeCompileParam, encodesDeclaredType, unencodableReason } from "./paramEncoding";

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
 * Resolves the compile-time parameters a contract is built with, from the manifest's wiring and
 * what the request and the deployment supply.
 *
 * The wiring lives in `compile_params`, a map of the contract's parameter name to a reference —
 * `{"PUB_KEY": "params.pubkey"}`. Note the collision the format carries: `compile_params` is
 * both this wiring map and a deprecated namespace prefix for references. This map is read as
 * wiring; a reference inside it is resolved at the compile-parameter site, which is what decides
 * that `instance.`, `params.`, `args.` and a bare name are meaningful here.
 *
 * What each value is encoded as comes from the type its parameter was declared with and from
 * nothing else — never from the value's own shape. `paramEncoding` holds the closed list of
 * types that have an encoding and refuses the rest by name, because the compiler accepts almost
 * anything shaped like a value and returns a valid address for the wrong contract.
 *
 * `declaredAtUse` is the third place a type can come from, and the only one the document states
 * outright. At one position — a `tapleaf` field of the deployment an action creates — the wiring
 * is written `{"IS_ACTIVE": {"type": "bool", "value": "false"}}`, so the type sits beside the
 * value rather than on a parameter declared elsewhere. Where it is given it wins, because a
 * declaration at the point of use cannot be a different parameter's by accident.
 */
export function resolveCompileParams(
	wiring: Record<string, unknown>,
	declaredTypes: Record<string, string>,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
	contract?: DeclaringContract,
	declaredAtUse?: Record<string, string>,
): ResolveCompileParamsResult {
	const resolved: ContractArguments = {};

	for (const [name, reference] of Object.entries(wiring)) {
		if (typeof reference !== "string") {
			return { ok: false, reason: `Compile parameter ${name} is not a reference.` };
		}

		const found = resolveCovenantReference(reference, scope, notes);

		if (!found.ok) {
			const literal =
				asStatedValue(name, reference, found.reason, declaredAtUse?.[name]) ??
				asContractLiteral(name, reference, found.reason, contract);

			if (!literal.ok) {
				return { ok: false, reason: `Compile parameter ${name}: ${literal.reason}` };
			}

			resolved[name] = literal.encoded;

			continue;
		}

		if (typeof found.value !== "string") {
			return {
				ok: false,
				reason: `Compile parameter ${name} resolves to ${reference}, which is not a value this runtime can encode yet.`,
			};
		}

		// A compile parameter's type comes from the parameter the manifest declares, so a
		// reference to something with no declared type has nothing to encode against.
		const declaredType = declaredAtUse?.[name] ?? declaredTypeOf(reference, declaredTypes);

		if (!encodesDeclaredType(declaredType)) {
			return { ok: false, reason: `${reference} ${unencodableReason(declaredType)}.` };
		}

		const encoded = encodeCompileParam(declaredType ?? "", found.value, name, reference);

		if (!encoded.ok) {
			return encoded;
		}

		resolved[name] = encoded.encoded;
	}

	return { arguments: resolved, ok: true };
}

/**
 * One compile-parameter reference, resolved against everything that can supply it.
 *
 * A bare name is tried as the request's own first, which is the order every other site reads one
 * in. What is added here is the third place a covenant's parameter can come from: the fields of
 * the deployment it belongs to.
 *
 * The corpus writes it that way throughout — `{"ASSET_B": "ASSET_B"}` on a swap's offer
 * covenant — and those name fields of the deployment rather than parameters of the action being
 * run. A protocol's constructor supplies them as parameters and every later action reads them
 * back off the deployment, so a runtime reading only the request compiles a protocol's first
 * action and refuses every one after it.
 *
 * Falling through here encodes nothing on a guess. A field reached this way still has to have
 * been declared with a type before anything is built out of it.
 */
function resolveCovenantReference(
	reference: string,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; value: unknown } {
	const found = resolveReference(reference, "compileParam", scope, notes);
	const parsed = parseReference(reference);

	if (found.ok || parsed?.form !== "bare") {
		return found;
	}

	return scope.instance && parsed.name in scope.instance
		? { ok: true, value: scope.instance[parsed.name] }
		: found;
}

/**
 * One wiring entry read as the value it is, at the type the document declared beside it.
 *
 * Nothing is returned where the document declared no type there, so the caller falls through to
 * what the contract says. The two are not alternatives to choose between by preference: this one
 * is a statement in the document being read, and the contract's is a fact about a different
 * artifact that happens to line up.
 *
 * A text shaped like a name that will not encode reports the lookup's own failure, for the same
 * reason `asContractLiteral` does: text shaped like a name is nearly always meant as one, and
 * "that is not 32 bytes of hex" would explain the wrong mistake to whoever reads it.
 */
function asStatedValue(
	name: string,
	text: string,
	referenceReason: string,
	declaredType: string | undefined,
): EncodeLiteralResult | undefined {
	if (declaredType === undefined) {
		return undefined;
	}

	if (!encodesDeclaredType(declaredType)) {
		return { ok: false, reason: `${name} is declared ${unencodableReason(declaredType)}.` };
	}

	const encoded = encodeCompileParam(declaredType, text, name, "a value");

	if (encoded.ok) {
		return encoded;
	}

	return {
		ok: false,
		reason: parseReference(text) === undefined ? encoded.reason : referenceReason,
	};
}

/**
 * One wiring entry that resolved to nothing, read as the value it is instead.
 *
 * Some compile parameters are wired to a bare value rather than to a name, and a value is not a
 * reference — resolving one always fails. The failure is the same one a misspelled field
 * produces, so the two are told apart by what the contract says rather than by how the text
 * looks: a parameter the contract declares can take a value, and a parameter it does not declare
 * is a lookup that failed.
 *
 * **A reference is tried first and keeps winning.** A deployment field is what a name means
 * wherever one exists, so nothing that resolves today is re-read as a value.
 */
function asContractLiteral(
	name: string,
	text: string,
	referenceReason: string,
	contract: DeclaringContract | undefined,
): EncodeLiteralResult {
	if (!contract || contract.declares[name] === undefined) {
		return { ok: false, reason: referenceReason };
	}

	const encoded = encodeContractLiteral(name, text, contract);

	if (encoded.ok) {
		return encoded;
	}

	return {
		ok: false,
		reason: parseReference(text) === undefined ? encoded.reason : referenceReason,
	};
}

type EncodeLiteralResult =
	| { encoded: { type: string; value: string }; ok: true }
	| { ok: false; reason: string };

/**
 * The declared type of whatever a reference points at.
 *
 * The corpus writes three spellings at this site — a bare name, a `params.` one and an
 * `instance.` one — and all three name a declaration by the same name. Anything else has no
 * declared type here rather than a guessed one: encoding a value at the wrong width changes the
 * address silently.
 */
function declaredTypeOf(
	reference: string,
	declaredTypes: Record<string, string>,
): string | undefined {
	const parsed = parseReference(reference);

	if (!parsed || parsed.form === "input-attribute") {
		return undefined;
	}

	return declaredTypes[parsed.name];
}
