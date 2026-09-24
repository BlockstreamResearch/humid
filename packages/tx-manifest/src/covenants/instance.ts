import { asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import { computedValue, computesValue } from "../evaluation/computedValue";
import { resolveCompileParams } from "./compileParams";
import { COVENANT_HASH_SEED, type HashCovenant, ITERATION_BOUND } from "./covenantHash";
import { encodeStateLeaves } from "./stateLeaves";

export type CreatedInstance = { fields: Record<string, string>; rounds: number };

export type CreateInstanceResult =
	| { instance: CreatedInstance; ok: true }
	| { ok: false; reason: string };

export function createsInstance(action: NormalisedAction): boolean {
	return asRecord(action.node.create_instance) !== undefined;
}

function computeKind(node: Record<string, unknown>): string | undefined {
	for (const key of ["compute", "type", "lang"]) {
		const value = node[key];

		if (typeof value === "string") {
			return value;
		}
	}

	return undefined;
}

export function statedCreatedFields(
	action: NormalisedAction,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): Record<string, string> {
	const declared = asRecord(asRecord(action.node.create_instance)?.fields);
	const stated: Record<string, string> = {};

	for (const [name, value] of Object.entries(declared ?? {})) {
		if (typeof value !== "string") {
			continue;
		}

		const resolved = resolveFieldReference(name, value, scope, notes);

		if (resolved.ok) {
			stated[name] = resolved.value;
		}
	}

	return stated;
}

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
	const ordered = inDependencyOrder(computed);
	let values: Record<string, string> = Object.fromEntries(
		computed.map(({ name }) => [name, COVENANT_HASH_SEED]),
	);

	for (let round = 1; round <= ITERATION_BOUND; round += 1) {
		const next: Record<string, string> = {};
		const settled: Record<string, string> = { ...values };

		for (const { name, node, source } of ordered) {
			const withNewFields = { ...direct, ...settled };
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
				undefined,
				wiring.declaredAtUse,
			);

			if (!resolved.ok) {
				return { ok: false, reason: `Computing ${name}: ${resolved.reason}` };
			}

			const stateLeaves = encodeStateLeaves(node.extra_leaves, {
				at: `Field ${name}`,
				...(input.notes === undefined ? {} : { notes: input.notes }),
				scope,
			});

			if (!stateLeaves.ok) {
				return { ok: false, reason: `Computing ${name}: ${stateLeaves.reason}` };
			}

			const hashed = input.hashCovenant({
				argumentsJson: JSON.stringify(resolved.arguments),
				extraLeavesJson: JSON.stringify(stateLeaves.leaves),
				source,
			});

			if (!hashed.ok) {
				return { ok: false, reason: `Computing ${name}: ${hashed.reason}` };
			}

			next[name] = hashed.hash;
			settled[name] = hashed.hash;
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

const NAME_IN_TEXT = /[A-Za-z_][A-Za-z0-9_]*/g;

function inDependencyOrder(computed: ComputedField[]): ComputedField[] {
	const names = new Set(computed.map(({ name }) => name));
	const waitingOn = new Map<string, Set<string>>();

	for (const field of computed) {
		waitingOn.set(field.name, dependenciesOf(field, names));
	}

	const ordered: ComputedField[] = [];
	const placed = new Set<string>();

	let progressed = true;

	while (progressed && ordered.length < computed.length) {
		progressed = false;

		for (const field of computed) {
			if (placed.has(field.name)) {
				continue;
			}

			const outstanding = [...(waitingOn.get(field.name) ?? [])].some(
				(on) => on !== field.name && !placed.has(on),
			);

			if (outstanding) {
				continue;
			}

			ordered.push(field);
			placed.add(field.name);
			progressed = true;
		}
	}

	return [...ordered, ...computed.filter(({ name }) => !placed.has(name))];
}

function dependenciesOf(field: ComputedField, names: Set<string>): Set<string> {
	const wiring = tapleafWiring(field.node);
	const found = new Set<string>();

	if (!wiring.ok) {
		return found;
	}

	for (const value of Object.values(wiring.wiring)) {
		if (typeof value !== "string") {
			continue;
		}

		for (const word of value.match(NAME_IN_TEXT) ?? []) {
			if (names.has(word)) {
				found.add(word);
			}
		}
	}

	return found;
}

type TapleafWiring = {
	declaredAtUse: Record<string, string>;
	ok: true;
	wiring: Record<string, unknown>;
};

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

function resolveFieldReference(
	name: string,
	text: string,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; value: string } {
	const found = resolveReference(text, "compileParam", scope);

	if (!found.ok) {
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
