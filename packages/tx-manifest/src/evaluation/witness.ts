import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import { type ReferenceScope, parseReference, resolveReference } from "../document/references";

/**
 * One witness value the document states outright, ready for the module that type-checks it.
 *
 * The type and the value stay text. A SimplicityHL literal is the compiler's to parse, and this
 * wallet does not implement that language — reading `Right(Left(()))` as a structure here would
 * be a second opinion about which branch a contract runs, given by the one component with no
 * way to check it.
 */
export type StaticWitness = {
	/** The witness the contract declares, by the name it declares it under. */
	name: string;
	/** The SimplicityHL type the document states for it. */
	simplicityType: string;
	/** The literal, with every name inside it replaced by what it refers to. */
	value: string;
};

export type StaticWitnessResult =
	| { ok: false; reason: string }
	| { ok: true; witnesses: Map<string, StaticWitness[]> };

/** The witness kind whose value the document states rather than computes. */
export const STATIC_WITNESS = "simplicityhl";

/**
 * Every static witness this action states, keyed by the input that carries it.
 *
 * Resolved after the hooks rather than beside the covenant, because a protocol may select a
 * branch by a field of its own deployment: the value is a literal with a name inside it, and
 * the name is not known until everything that writes fields has run.
 */
export function resolveStaticWitnesses(
	action: NormalisedAction,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): StaticWitnessResult {
	const witnesses = new Map<string, StaticWitness[]>();

	for (const entry of asArray(action.node.inputs)) {
		const input = asRecord(entry);

		if (!input) {
			continue;
		}

		const id = typeof input.id === "string" ? input.id : "(unnamed)";
		const stated: StaticWitness[] = [];

		for (const [name, declared] of Object.entries(asRecord(input.witnesses) ?? {})) {
			const witness = asRecord(declared);

			if (witness?.type !== STATIC_WITNESS) {
				continue;
			}

			const simplicityType = witness.simplicity_type;
			const value = witness.value;

			if (typeof simplicityType !== "string" || typeof value !== "string") {
				return {
					ok: false,
					reason:
						`The witness ${name} on input ${id} is a stated value, and the document states ` +
						"either no type for it or no value.",
				};
			}

			const filled = fill(value, scope, notes);

			if (!filled.ok) {
				return { ok: false, reason: `The witness ${name} on input ${id}: ${filled.reason}` };
			}

			stated.push({ name, simplicityType, value: filled.value });
		}

		if (stated.length > 0) {
			witnesses.set(id, stated);
		}
	}

	return { ok: true, witnesses };
}

/** Names inside a literal, and nothing else: `instance.X`, `params.X`, `args.X`. */
const NAMED = /\$?[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*/g;

/**
 * Replaces the names a stated value refers to, leaving the rest of the text exactly as written.
 *
 * Almost every stated value in the corpus is a literal with nothing to replace. The ones that
 * are not select a branch carrying a field of their own deployment, so a runtime that skipped
 * this would hand the compiler the word `instance.CURRENT_DEBT` and be told the literal does
 * not parse — which is true and says nothing about why.
 *
 * Only a name with a namespace is touched. `Left`, `Right` and `u32` are the language's own
 * words, and substituting one of those would rewrite the branch the document chose.
 */
function fill(
	value: string,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; value: string } {
	let failure: string | undefined;

	const filled = value.replaceAll(NAMED, (text) => {
		const reference = parseReference(text);

		// A dotted name this runtime reads as an input and one of its attributes is not a
		// reference here: the site accepts three namespaces and nothing else, so leaving it alone
		// would hand the compiler a word it cannot parse and claiming it resolves would be worse.
		// Refusing names it.
		if (reference?.form === "input-attribute") {
			failure ??= `"${text}" cannot be used as part of a witness value.`;

			return text;
		}

		const found = resolveReference(text, "witnessValue", scope, notes);

		if (!found.ok) {
			failure ??= found.reason;

			return text;
		}

		return String(found.value);
	});

	return failure === undefined ? { ok: true, value: filled } : { ok: false, reason: failure };
}
