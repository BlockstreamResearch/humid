import type { Action } from "../document/manifest";
import type { Compute } from "../document/schema";
import { Refusal } from "../refusal";
import type { Scope } from "../values/scope";
import { hashComputedProgram, tapleafWiring } from "./computedProgram";
import { PROGRAM_HASH_SEED, type HashProgram, ITERATION_BOUND } from "./programHash";

export type CreatedInstance = { fields: Record<string, string>; rounds: number };

export function resolveStatedFields(action: Action, scope: Scope): Record<string, string> {
	const stated: Record<string, string> = {};

	for (const [name, value] of Object.entries(action.create_instance?.fields ?? {})) {
		if (typeof value !== "string") {
			continue;
		}

		const resolved = Refusal.attempt(() => scope.text(`Field ${name}`, value));

		if (resolved !== undefined) {
			stated[name] = resolved;
		}
	}

	return stated;
}

export function resolveCreatedInstance(
	action: Action,
	input: {
		contractSources: Record<string, string>;
		hashProgram: HashProgram;
		scope: Scope;
	},
): CreatedInstance {
	const declared = action.create_instance?.fields;

	if (!declared) {
		throw new Refusal("This action does not create an instance.");
	}

	const direct: Record<string, string> = {};
	const computed: ComputedField[] = [];

	for (const [name, value] of Object.entries(declared)) {
		if (typeof value === "string") {
			direct[name] = input.scope.text(`Field ${name}`, value);

			continue;
		}

		if (value.type !== "tapleaf") {
			throw new Refusal(
				`Field ${name} is computed by "${value.type}", which this runtime does not ` +
					"implement. Honouring it means executing a contract while building the " +
					"transaction, not merely compiling one.",
			);
		}

		computed.push({ compute: value, name });
	}

	if (computed.length === 0) {
		return { fields: direct, rounds: 0 };
	}

	const hashing = {
		contractSources: input.contractSources,
		declaredTypes: fieldTypes(declared),
		hashProgram: input.hashProgram,
	};
	const ordered = inDependencyOrder(computed);
	let values: Record<string, string> = Object.fromEntries(
		computed.map(({ name }) => [name, PROGRAM_HASH_SEED]),
	);

	for (let round = 1; round <= ITERATION_BOUND; round += 1) {
		const next: Record<string, string> = {};
		const settled: Record<string, string> = { ...values };

		for (const { compute, name } of ordered) {
			const withNewFields = { ...direct, ...settled };
			const scope = input.scope.withInstance(withNewFields).withParams(withNewFields);
			const hash = hashComputedProgram(name, compute, scope, hashing);

			next[name] = hash;
			settled[name] = hash;
		}

		if (computed.every(({ name }) => next[name] === values[name])) {
			return { fields: { ...direct, ...next }, rounds: round };
		}

		values = next;
	}

	throw new Refusal(
		`The program hashes this deployment's fields compute never settle: ${computed
			.map(({ name }) => name)
			.join(", ")} still change after ${ITERATION_BOUND} rounds. ` +
			"A deployment recorded from values that never agreed with themselves would locate " +
			"funds at an address nobody checked.",
	);
}

type ComputedField = { compute: Compute; name: string };

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
	const found = new Set<string>();

	for (const value of Object.values(tapleafWiring(field.compute).wiring)) {
		for (const word of value.match(NAME_IN_TEXT) ?? []) {
			if (names.has(word)) {
				found.add(word);
			}
		}
	}

	return found;
}

function fieldTypes(declared: Record<string, string | Compute>): Record<string, string> {
	const types: Record<string, string> = {};

	for (const [name, value] of Object.entries(declared)) {
		if (typeof value === "string" || value.type !== "tapleaf") {
			continue;
		}

		types[name] = "bytes32";

		for (const [param, spec] of Object.entries(value.params)) {
			if (typeof spec !== "string" && spec.type !== undefined) {
				types[spec.value] = spec.type;
				types[param] ??= spec.type;
			}
		}
	}

	return types;
}
