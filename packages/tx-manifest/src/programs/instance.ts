import type { Action } from "../document/manifest";
import type { ReferenceScope } from "../document/references";
import type { Compute } from "../document/schema";
import { statedValue } from "../evaluation/computedValue";
import { Refusal } from "../refusal";
import { resolveCompileParams } from "./compileParams";
import { PROGRAM_HASH_SEED, type HashProgram, ITERATION_BOUND } from "./programHash";
import { stateLeavesOf } from "./stateLeaves";

export type CreatedInstance = { fields: Record<string, string>; rounds: number };

export function statedCreatedFields(action: Action, scope: ReferenceScope): Record<string, string> {
	const stated: Record<string, string> = {};

	for (const [name, value] of Object.entries(action.create_instance?.fields ?? {})) {
		if (typeof value !== "string") {
			continue;
		}

		const resolved = Refusal.attempt(() => statedValue(`Field ${name}`, value, scope));

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
		scope: ReferenceScope;
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
			direct[name] = statedValue(`Field ${name}`, value, input.scope);

			continue;
		}

		if (value.type !== "tapleaf") {
			throw new Refusal(
				`Field ${name} is computed by "${value.type}", which this runtime does not ` +
					"implement. Honouring it means executing a contract while building the " +
					"transaction, not merely compiling one.",
			);
		}

		const { simf } = value;

		if (simf === undefined) {
			throw new Refusal(`Field ${name} names no contract to compute from.`);
		}

		const source = input.contractSources[simf];

		if (source === undefined) {
			throw new Refusal(`The source of ${simf} was not supplied.`);
		}

		computed.push({ compute: value, name, source });
	}

	if (computed.length === 0) {
		return { fields: direct, rounds: 0 };
	}

	const declaredTypes = fieldTypes(declared);
	const ordered = inDependencyOrder(computed);
	let values: Record<string, string> = Object.fromEntries(
		computed.map(({ name }) => [name, PROGRAM_HASH_SEED]),
	);

	for (let round = 1; round <= ITERATION_BOUND; round += 1) {
		const next: Record<string, string> = {};
		const settled: Record<string, string> = { ...values };

		for (const { compute, name, source } of ordered) {
			const withNewFields = { ...direct, ...settled };
			const scope: ReferenceScope = {
				...input.scope,
				instance: { ...input.scope.instance, ...withNewFields },
				params: { ...input.scope.params, ...withNewFields },
			};
			const hash = Refusal.amend(
				() => {
					const wiring = tapleafWiring(compute);

					return input.hashProgram({
						argumentsJson: JSON.stringify(
							resolveCompileParams(
								wiring.wiring,
								declaredTypes,
								scope,
								undefined,
								wiring.declaredAtUse,
							),
						),
						extraLeavesJson: JSON.stringify(
							stateLeavesOf(compute.extra_leaves, { at: `Field ${name}`, scope }),
						),
						source,
					});
				},
				(reason) => `Computing ${name}: ${reason}`,
			);

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

type ComputedField = { compute: Compute; name: string; source: string };

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

type TapleafWiring = {
	declaredAtUse: Record<string, string>;
	wiring: Record<string, string>;
};

function tapleafWiring(compute: Compute): TapleafWiring {
	const declaredAtUse: Record<string, string> = {};
	const wiring: Record<string, string> = {};

	for (const [name, spec] of Object.entries(compute.params)) {
		if (typeof spec === "string") {
			wiring[name] = spec;

			continue;
		}

		if (spec.type !== undefined) {
			declaredAtUse[name] = spec.type;
		}

		wiring[name] = spec.value;
	}

	return { declaredAtUse, wiring };
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
