import { asArray, asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import { computedValue, computesValue } from "../evaluation/computedValue";
import { resolveCompileParams } from "./compileParams";
import { COVENANT_HASH_SEED, type HashCovenant, ITERATION_BOUND } from "./covenantHash";

/**
 * The deployment an action creates, once its field values are worked out.
 *
 * `rounds` is how many passes the covenant hashes took to settle, and is zero when the action's
 * fields hold no computed value at all.
 */
export type CreatedInstance = { fields: Record<string, string>; rounds: number };

export type CreateInstanceResult =
	| { instance: CreatedInstance; ok: true }
	| { ok: false; reason: string };

/**
 * Whether this action deploys a new contract instance.
 *
 * Two generations spell it differently and one of them spells it twice. The older writes a
 * boolean flag beside a block; the newer dropped the flag on the ground that an action carrying
 * the block *is* the constructor, and there is nothing a flag could add that the block does not
 * already say. So the block alone is read — and a flag with no block is a document declaring a
 * constructor that constructs nothing, which is a fault rather than a generation.
 */
export function createsInstance(action: NormalisedAction): boolean {
	return asRecord(action.node.create_instance) !== undefined;
}

/**
 * What a field's value is computed by, whichever word this document uses for it.
 *
 * Three spellings name the same thing across the corpus — `compute`, `type` and `lang` — and
 * none of them is a version marker, so a runtime that reads one reads part of the corpus and
 * refuses the rest for a reason that is not about the protocol.
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
 * reference — or a covenant's script hash, which has to be compiled to be known. The second kind
 * may name other fields of the same new instance, including in a cycle, so it is resolved the
 * way the format's reference implementation resolves computed parameters: every unknown starts
 * at a seed, all of them are recomputed together, and the round that reproduces its own input is
 * the answer.
 *
 * A chain that is not circular converges as fast as its depth, so this covers the ordinary case
 * without a separate topological pass — the ordering falls out of the iteration.
 *
 * **Exceeding the bound refuses.** The alternative is returning the last round's values, which
 * are an address derived from something that never agreed with itself; the wallet would then
 * compare that address against the chain and refuse anyway, having spent the work, or worse, pay
 * to it.
 *
 * **A literal stays a literal.** Some fields hold `"0"` or `"2"` rather than a reference, and a
 * manifest saying a field is two means two. Resolution is tried first, and only a text that
 * could not have named anything — no `$`, no dot — falls through to being itself. One that named
 * something absent is a document asking for a value nobody supplied, and reading it as the
 * string `"$params.X"` would hide that.
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

		// A leaf is part of the taproot tree the scriptPubKey is derived from, so a hash taken
		// without one is the hash of a different covenant — and a hidden node has nothing to fail
		// on, so the wrong answer would be a well-formed one. Refused rather than ignored.
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
			// covenant compiles against is this instance rather than only the request's parameters.
			//
			// **Both namespaces, because the document writes the reading both ways.** A bare name
			// is looked up among the parameters first, so the new fields go there; an explicit
			// `instance.OTHER_HASH` — or the deprecated `compile_params.OTHER_HASH` spelling of it —
			// is looked up in the deployment, and the deployment it means is this one. Offering
			// only the first would resolve that spelling against whatever came before, which for a
			// constructor is nothing at all: the round would refuse for want of a value it had just
			// worked out. The request's own parameters and any earlier deployment stay underneath,
			// so a name neither of these rounds produced still resolves the way it always did.
			const withNewFields = { ...direct, ...values };
			const scope: ReferenceScope = {
				...input.scope,
				instance: { ...input.scope.instance, ...withNewFields },
				params: { ...input.scope.params, ...withNewFields },
			};
			const wiring = tapleafWiring(node);

			if (!wiring.ok) {
				return { ok: false, reason: `Computing ${name}: ${wiring.reason}` };
			}

			const resolved = resolveCompileParams(
				wiring.wiring,
				declaredTypes,
				scope,
				input.notes,
				undefined,
				wiring.declaredAtUse,
			);

			if (!resolved.ok) {
				return { ok: false, reason: `Computing ${name}: ${resolved.reason}` };
			}

			// An empty leaf list, stated rather than omitted: a tapleaf declaring any leaf is
			// refused above, so this is the whole truth here rather than a value stood in for one.
			const hashed = input.hashCovenant({
				argumentsJson: JSON.stringify(resolved.arguments),
				extraLeavesJson: "[]",
				source,
			});

			if (!hashed.ok) {
				return { ok: false, reason: `Computing ${name}: ${hashed.reason}` };
			}

			next[name] = hashed.hash;
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

type TapleafWiring = {
	/** The type the document wrote beside each value, keyed by the contract's parameter name. */
	declaredAtUse: Record<string, string>;
	ok: true;
	wiring: Record<string, unknown>;
};

/**
 * The wiring a tapleaf's parameters describe, in the shape the compile-parameter resolver reads.
 *
 * The two positions spell the same thing differently, and this is where they meet. A covenant's
 * own wiring map holds references — `{"PUB_KEY": "MAKER_PUB_KEY"}`. A tapleaf inside a
 * deployment's fields holds objects — `{"PUB_KEY": {"type": "pubkey", "value": "MAKER_PUB_KEY"}}`
 * — because the declaration carries the type at the point of use rather than from a parameter
 * declared elsewhere. The reference is the `value`, and the `type` beside it is what the encoder
 * needs.
 *
 * So the type is carried out beside the wiring rather than dropped. Most of these values are
 * names and take their type from what they name; the rest are written outright — `"1"`, `"true"`
 * — and the only thing that says what width or kind those are is the word the document wrote
 * next to them.
 */
function tapleafWiring(
	node: Record<string, unknown>,
): TapleafWiring | { ok: false; reason: string } {
	const declared = asRecord(node.params);

	if (!declared) {
		return { declaredAtUse: {}, ok: true, wiring: {} };
	}

	const declaredAtUse: Record<string, string> = {};
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

		const type = asRecord(spec)?.type;

		if (typeof type === "string") {
			declaredAtUse[name] = type;
		}

		wiring[name] = value;
	}

	return { declaredAtUse, ok: true, wiring };
}

/** Reads one field written as a string: a reference where it names something, else itself. */
function resolveFieldReference(
	name: string,
	text: string,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; value: string } {
	const found = resolveReference(text, "compileParam", scope, notes);

	if (!found.ok) {
		// A field the document works out rather than states. Asked only after a reference has
		// failed, and recognised by the operators it is written with rather than by whether it
		// evaluates: a field holding thirty-two zero bytes is a hash and is also legal
		// arithmetic, and evaluating it would record `0` — a different value at every position
		// that compiles it, and one nothing downstream could tell from the real one.
		if (computesValue(text)) {
			const computed = computedValue(text, "compileParam", scope, notes);

			return computed.ok ? computed : { ok: false, reason: `Field ${name}: ${computed.reason}` };
		}

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
 * A computed field is a covenant's script hash and is thirty-two bytes by construction, so it
 * needs no declaration. Every other field takes the type its own tapleaf parameters declare,
 * which is where the corpus states them.
 */
function fieldTypes(declared: Record<string, unknown>): Record<string, string> {
	const types: Record<string, string> = {};

	for (const [name, value] of Object.entries(declared)) {
		const node = asRecord(value);

		if (!node || computeKind(node) !== "tapleaf") {
			continue;
		}

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

	return types;
}
