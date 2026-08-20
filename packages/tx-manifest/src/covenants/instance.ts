import { asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import { computedValue, computesValue } from "../evaluation/computedValue";
import { literalDefaults } from "../evaluation/parameters";
import { resolveCompileParams } from "./compileParams";
import { COVENANT_HASH_SEED, type HashCovenant, ITERATION_BOUND } from "./computed";
import { encodeExtraLeaves } from "./extraLeaves";

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
 *
 * **A deployment being created is known in two moments, and this reads whichever one it is
 * asked for.** Some of its fields the request and the existing deployment already determine;
 * others only the action's own inputs can produce — an asset id is a function of the output
 * an issuing input spends, so the field holding it cannot exist until that output has been
 * chosen. The first moment is needed anyway: which asset an issuing input carries is itself
 * stated as a field of the deployment being created, so nothing could be issued if every
 * field had to wait for the issuance. `unresolved: "omit"` reads that moment and leaves out
 * what it cannot answer; the default refuses, and is the reading the transaction is built on.
 */
export function resolveCreatedInstance(
	action: NormalisedAction,
	input: {
		contractSources: Record<string, string>;
		hashCovenant: HashCovenant;
		notes?: NormalisationNote[];
		scope: ReferenceScope;
		/**
		 * What a field nothing in scope can supply yet is.
		 *
		 * `"refuse"` — the default — is the deployment as it will be recorded: a field left
		 * unresolved there is a document asking for a value nobody has. `"omit"` is the earlier
		 * moment, where a missing field means "not yet" rather than "never".
		 *
		 * A computed field is skipped entirely while omitting, rather than worked out from a
		 * partial scope. Its value is a covenant's script hash, and one derived from fields that
		 * were not all in yet is not an incomplete answer — it is a wrong one, of exactly the
		 * shape nothing downstream can tell from a right one.
		 */
		unresolved?: "omit" | "refuse";
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

	const omitting = input.unresolved === "omit";
	const direct: Record<string, string> = {};
	const computed: ComputedField[] = [];

	for (const [name, value] of Object.entries(declared)) {
		if (typeof value === "string") {
			const resolved = resolveFieldReference(name, value, input.scope, input.notes);

			if (!resolved.ok) {
				if (omitting) {
					continue;
				}

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

		if (omitting) {
			continue;
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

			// The leaves are read against the same scope the wiring is, and for the same reason:
			// this field is the script hash of a covenant the action goes on to create, and the
			// utxo type declaring that covenant writes the very same leaves reading the very same
			// fields. Hashing without them would produce a value the covenant can never match, and
			// a hidden taproot node has nothing to fail on — it would simply be a different tree.
			const leaves = encodeExtraLeaves(node.extra_leaves, { notes: input.notes, scope });

			if (!leaves.ok) {
				return { ok: false, reason: `Computing ${name}: ${leaves.reason}` };
			}

			next[name] = input.hashCovenant({
				argumentsJson: JSON.stringify(resolved.arguments),
				extraLeavesJson: JSON.stringify(leaves.hex),
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
 *
 * So the type is carried out beside the wiring rather than dropped. Most of these values are
 * names and take their type from what they name; the rest are written outright — `"1"`,
 * `"true"` — and the only thing that says what width or kind those are is the word the document
 * wrote next to them. Without it a live protocol's deployment cannot be worked out at all, and
 * guessing from the shape of `"1"` is the failure the closed type list exists to prevent.
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

type TapleafWiring = {
	/** The type the document wrote beside each value, keyed by the contract's parameter name. */
	declaredAtUse: Record<string, string>;
	ok: true;
	wiring: Record<string, unknown>;
};

/**
 * Reads one field written as a string.
 *
 * The corpus writes four reference spellings here, two literals, and arithmetic. A string that
 * resolves is its value; a string that computes one is what it comes to; a string that names
 * nothing is itself, because a field holding `"2"` is a field holding two rather than a broken
 * reference.
 *
 * **The three readings are tried in that order and the order is the whole of the rule.**
 * Arithmetic is recognised by the operators it is written with rather than by whether it
 * evaluates, because a literal is nearly always also legal arithmetic: read as a formula, a
 * field holding thirty-two zero bytes becomes `"0"`, which is a different value everywhere it
 * is encoded and is not an error anywhere. `computesValue` is what keeps a literal a literal.
 *
 * A formula is read at the compile-parameter position, which is the position this field sits
 * at — so its terms may name the request, this deployment and a bare name, and may not name the
 * fee or an input the wallet resolved. Both exclusions are the same circularity: the value
 * decides a covenant's address, and the fee and the inputs are read from the transaction that
 * pays to it.
 */
function resolveFieldReference(
	name: string,
	text: string,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; value: string } {
	const found = resolveReference(text, "compileParam", scope, notes);

	if (!found.ok) {
		if (computesValue(text)) {
			const worked = computedValue(text, "compileParam", scope, notes);

			return worked.ok ? worked : { ok: false, reason: `Field ${name}: ${worked.reason}` };
		}

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

/**
 * Fills in the fields of a supplied deployment that only a compiler can produce.
 *
 * A deployment is written once, by the action that creates it, and read by every action after.
 * Half its fields are ordinary values anyone can carry — the assets, the amounts, the rate, the
 * expiration — and half are covenant script hashes, which are the output of compiling a contract.
 * A site that did not create the deployment can hold the first half and cannot compute the second,
 * so an action reading one would refuse for want of a value nobody but a wallet can make.
 *
 * The document already says how each of those is computed: the constructor's `create_instance`
 * block describes them, and this runtime computes them there. This reads that same description at
 * the other moment, from the fields the request did supply.
 *
 * What the request supplies always wins. This adds what is missing and overwrites nothing, because
 * a value the site holds is what the deployment was recorded with — recomputing it would be this
 * wallet deciding what the deployment says about itself.
 */
export function completeSuppliedInstance(
	manifest: { actions: NormalisedAction[] },
	action: NormalisedAction,
	supplied: Record<string, unknown>,
	input: {
		contractSources: Record<string, string>;
		hashCovenant: HashCovenant;
		notes?: NormalisationNote[];
	},
): { fields: Record<string, unknown>; ok: true } | { ok: false; reason: string } {
	const constructor = manifest.actions.find(
		(candidate) =>
			candidate.boundTo === action.boundTo &&
			asRecord(candidate.node.create_instance) !== undefined,
	);

	// A deployment with no constructor in this document is one the site holds in full or not at
	// all; there is nothing here to derive it from, and saying so beats inventing a value.
	if (!constructor || action.name === constructor.name) {
		return { fields: supplied, ok: true };
	}

	const flat = Object.fromEntries(
		Object.entries(supplied).filter(([, value]) => typeof value === "string"),
	);
	// The constructor's fields read `$params.NAME` for the values it was given and
	// `$instance.NAME` for the ones it worked out. Reading a deployment, both are the same
	// thing: what it was recorded with — except for a parameter the document states a default
	// for, which is a constant of the document rather than of the deployment. A site reading
	// somebody else's deployment holds what was recorded and not what the document says about
	// itself, so the default is read here and still loses to a supplied value.
	const resolved = resolveCreatedInstance(constructor, {
		contractSources: input.contractSources,
		hashCovenant: input.hashCovenant,
		...(input.notes === undefined ? {} : { notes: input.notes }),
		scope: { instance: flat, params: { ...literalDefaults(constructor), ...flat } },
	});

	if (!resolved.ok) {
		return resolved;
	}

	return { fields: { ...resolved.instance.fields, ...supplied }, ok: true };
}
