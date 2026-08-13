import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import { resolveCompileParams } from "./compileParams";
import { COVENANT_HASH_SEED, type HashCovenant, ITERATION_BOUND } from "./computed";

/**
 * The deployment an action creates, once its field values are worked out.
 *
 * `rounds` is how many passes the covenant hashes took to settle, and is zero when the
 * action's fields hold no computed value at all.
 */
export type CreatedInstance = { fields: Record<string, string>; rounds: number };

export type CreateInstanceResult =
	| { instance: CreatedInstance; ok: true }
	| { ok: false; reason: string };

/**
 * Whether this action deploys a new contract instance.
 *
 * Two generations spell it differently and one of them spells it twice. The older writes a
 * boolean flag beside a block; the newer dropped the flag on the ground that an action
 * carrying the block *is* the constructor, and there is nothing a flag could add that the
 * block does not already say. Six of the corpus's eleven constructors carry both spellings
 * and five carry only the block, so reading the block alone reads every one of them —
 * and a flag with no block is a document declaring a constructor that constructs nothing,
 * which is a fault rather than a generation.
 */
export function createsInstance(action: NormalisedAction): boolean {
	return asRecord(action.node.create_instance) !== undefined;
}

/**
 * What a field's value is computed by, whichever word this document uses for it.
 *
 * Three spellings name the same thing. The published specification says `lang`; the corpus
 * says `compute` nineteen times and `type` twelve, inside the same seven protocols. None of
 * them is a version marker — both appear in the current generation — so a runtime that reads
 * one reads two thirds of the corpus and refuses the rest for a reason that is not about the
 * protocol.
 */
function computeKind(node: Record<string, unknown>): string | undefined {
	for (const key of ["compute", "type", "lang"]) {
		const value = node[key];

		if (typeof value === "string") {
			return value;
		}
	}

	return undefined;
}

/**
 * Works out the field values of the instance an action deploys.
 *
 * A field is either a value the request or an earlier deployment already holds — reached by
 * reference — or a covenant's script hash, which has to be compiled to be known. The second
 * kind may name other fields of the same new instance, including in a cycle, so it is
 * resolved the way the reference implementation resolves computed parameters: every
 * unknown starts at a seed, all of them are recomputed together, and the round that
 * reproduces its own input is the answer.
 *
 * **A literal stays a literal.** Some fields hold `"0"` or `"2"` rather than a reference,
 * and a manifest saying a field is two means two. Resolution is tried first and a failure
 * to resolve is not an error for a string that names nothing.
 */
export function resolveCreatedInstance(
	action: NormalisedAction,
	input: {
		contractSources: Record<string, string>;
		hashCovenant: HashCovenant;
		notes?: NormalisationNote[];
		scope: ReferenceScope;
	},
): CreateInstanceResult {
	const block = asRecord(action.node.create_instance);

	if (!block) {
		return { ok: false, reason: "This action does not create an instance." };
	}

	const declared = asRecord(block.fields);

	if (!declared) {
		return { ok: false, reason: "The action creates an instance and declares no fields for it." };
	}

	const direct: Record<string, string> = {};
	const computed: ComputedField[] = [];

	for (const [name, value] of Object.entries(declared)) {
		if (typeof value === "string") {
			const resolved = resolveFieldReference(name, value, input.scope, input.notes);

			if (!resolved.ok) {
				return resolved;
			}

			direct[name] = resolved.value;
			continue;
		}

		const node = asRecord(value);

		if (!node) {
			return { ok: false, reason: `Field ${name} is neither a reference nor a computed value.` };
		}

		const kind = computeKind(node);

		if (kind !== "tapleaf") {
			return {
				ok: false,
				reason:
					`Field ${name} is computed by "${String(kind)}", which this runtime does not ` +
					"implement. Honouring it means executing a contract while building the " +
					"transaction, not merely compiling one.",
			};
		}

		if (asArray(node.extra_leaves).length > 0) {
			return {
				ok: false,
				reason: `Field ${name} carries extra_leaves, which this runtime does not encode yet.`,
			};
		}

		const simf = node.simf;

		if (typeof simf !== "string") {
			return { ok: false, reason: `Field ${name} names no contract to compute from.` };
		}

		const source = input.contractSources[simf];

		if (source === undefined) {
			return { ok: false, reason: `The source of ${simf} was not supplied.` };
		}

		computed.push({ name, node, source });
	}

	if (computed.length === 0) {
		return { instance: { fields: direct, rounds: 0 }, ok: true };
	}

	const declaredTypes = fieldTypes(declared);
	let values: Record<string, string> = Object.fromEntries(
		computed.map(({ name }) => [name, COVENANT_HASH_SEED]),
	);

	for (let round = 1; round <= ITERATION_BOUND; round += 1) {
		const next: Record<string, string> = {};

		for (const { name, node, source } of computed) {
			// A tapleaf's own wiring names fields of the instance being created, so the scope a
			// covenant compiles against is this instance rather than the request's parameters.
			const scope: ReferenceScope = {
				...input.scope,
				params: { ...input.scope.params, ...direct, ...values },
			};
			const wiring = tapleafWiring(node);

			if (!wiring.ok) {
				return { ok: false, reason: `Computing ${name}: ${wiring.reason}` };
			}

			const resolved = resolveCompileParams(wiring.wiring, declaredTypes, scope, input.notes);

			if (!resolved.ok) {
				return { ok: false, reason: `Computing ${name}: ${resolved.reason}` };
			}

			next[name] = input.hashCovenant({
				argumentsJson: JSON.stringify(resolved.arguments),
				source,
			});
		}

		if (computed.every(({ name }) => next[name] === values[name])) {
			return { instance: { fields: { ...direct, ...next }, rounds: round }, ok: true };
		}

		values = next;
	}

	return {
		ok: false,
		reason:
			`The covenant hashes this deployment's fields compute never settle: ${computed
				.map(({ name }) => name)
				.join(", ")} still change after ${ITERATION_BOUND} rounds. ` +
			"A deployment recorded from values that never agreed with themselves would locate " +
			"funds at an address nobody checked.",
	};
}

type ComputedField = { name: string; node: Record<string, unknown>; source: string };

/**
 * The wiring a tapleaf's parameters describe, in the shape the compile-parameter resolver reads.
 *
 * The two positions spell the same thing differently, and this is where they meet. A
 * covenant's own wiring map holds references — `{"PUB_KEY": "MAKER_PUB_KEY"}`. A tapleaf
 * inside a deployment's fields holds objects — `{"PUB_KEY": {"type": "pubkey", "value":
 * "MAKER_PUB_KEY"}}` — because the declaration carries the type at the point of use rather
 * than from a parameter declared elsewhere. The reference is the `value`, and the `type`
 * beside it is what the encoder needs.
 */
function tapleafWiring(
	node: Record<string, unknown>,
): { ok: false; reason: string } | { ok: true; wiring: Record<string, unknown> } {
	const declared = asRecord(node.params);

	if (!declared) {
		return { ok: true, wiring: {} };
	}

	const wiring: Record<string, unknown> = {};

	for (const [name, spec] of Object.entries(declared)) {
		if (typeof spec === "string") {
			wiring[name] = spec;
			continue;
		}

		const value = asRecord(spec)?.value;

		if (typeof value !== "string") {
			return { ok: false, reason: `Parameter ${name} names no value to compile with.` };
		}

		wiring[name] = value;
	}

	return { ok: true, wiring };
}

/**
 * Reads one field written as a string.
 *
 * The corpus writes four reference spellings here and two literals. A string that resolves
 * is its value; a string that names nothing is itself, because a field holding `"2"` is a
 * field holding two rather than a broken reference.
 */
function resolveFieldReference(
	name: string,
	text: string,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; value: string } {
	const found = resolveReference(text, "compileParam", scope, notes);

	if (!found.ok) {
		// Only a text that could not name anything falls through to being a literal. One that
		// named something absent is a document asking for a value nobody supplied, and saying
		// "the field is the string $params.X" would hide that.
		return text.startsWith("$") || text.includes(".")
			? { ok: false, reason: `Field ${name}: ${found.reason}` }
			: { ok: true, value: text };
	}

	if (typeof found.value !== "string") {
		return {
			ok: false,
			reason: `Field ${name} resolves to a value this runtime cannot record as a field yet.`,
		};
	}

	return { ok: true, value: found.value };
}

/**
 * The declared types of the fields a tapleaf's wiring can name.
 *
 * A computed field is a covenant's script hash and is thirty-two bytes by construction, so
 * it needs no declaration. Every other field takes the type its own tapleaf parameters
 * declare, which is where the corpus states them.
 */
function fieldTypes(declared: Record<string, unknown>): Record<string, string> {
	const types: Record<string, string> = {};

	for (const [name, value] of Object.entries(declared)) {
		const node = asRecord(value);

		if (node && computeKind(node) === "tapleaf") {
			types[name] = "bytes32";

			for (const [param, spec] of Object.entries(asRecord(node.params) ?? {})) {
				const type = asRecord(spec)?.type;
				const target = asRecord(spec)?.value;

				if (typeof type === "string" && typeof target === "string") {
					types[target] = type;
					types[param] ??= type;
				}
			}
		}
	}

	return types;
}
