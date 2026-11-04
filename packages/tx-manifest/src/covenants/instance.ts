import { asRecord } from "../document/json";
import type { Action } from "../document/manifest";
import { type ReferenceScope, resolveReference } from "../document/references";
import { computedValue, computesValue } from "../evaluation/computedValue";
import { Refusal } from "../refusal";
import { resolveCompileParams } from "./compileParams";
import { COVENANT_HASH_SEED, type HashCovenant, ITERATION_BOUND } from "./covenantHash";
import { stateLeavesOf } from "./stateLeaves";

export type CreatedInstance = { fields: Record<string, string>; rounds: number };

export function createsInstance(action: Action): boolean {
	return asRecord(action.node.create_instance) !== undefined;
}

function computeKind(node: Record<string, unknown>): string | undefined {
	for (const key of ["type", "lang"]) {
		const value = node[key];

		if (typeof value === "string") {
			return value;
		}
	}

	return undefined;
}

export function statedCreatedFields(action: Action, scope: ReferenceScope): Record<string, string> {
	const declared = asRecord(asRecord(action.node.create_instance)?.fields);
	const stated: Record<string, string> = {};

	for (const [name, value] of Object.entries(declared ?? {})) {
		if (typeof value !== "string") {
			continue;
		}

		const resolved = Refusal.attempt(() => resolveFieldReference(name, value, scope));

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
		hashCovenant: HashCovenant;
		scope: ReferenceScope;
	},
): CreatedInstance {
	const block = asRecord(action.node.create_instance);

	if (!block) {
		throw new Refusal("This action does not create an instance.");
	}

	const declared = asRecord(block.fields);

	if (!declared) {
		throw new Refusal("The action creates an instance and declares no fields for the instance.");
	}

	const direct: Record<string, string> = {};
	const computed: ComputedField[] = [];

	for (const [name, value] of Object.entries(declared)) {
		if (typeof value === "string") {
			direct[name] = resolveFieldReference(name, value, input.scope);

			continue;
		}

		const node = asRecord(value);

		if (!node) {
			throw new Refusal(`Field ${name} is neither a reference nor a computed value.`);
		}

		const kind = computeKind(node);

		if (kind !== "tapleaf") {
			throw new Refusal(
				`Field ${name} is computed by "${String(kind)}", which this runtime does not ` +
					"implement. Honouring it means executing a contract while building the " +
					"transaction, not merely compiling one.",
			);
		}

		const simf = node.simf;

		if (typeof simf !== "string") {
			throw new Refusal(`Field ${name} names no contract to compute from.`);
		}

		const source = input.contractSources[simf];

		if (source === undefined) {
			throw new Refusal(`The source of ${simf} was not supplied.`);
		}

		computed.push({ name, node, source });
	}

	if (computed.length === 0) {
		return { fields: direct, rounds: 0 };
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
			const hash = Refusal.amend(
				() => {
					const wiring = tapleafWiring(node);

					return input.hashCovenant({
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
							stateLeavesOf(node.extra_leaves, { at: `Field ${name}`, scope }),
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
		`The covenant hashes this deployment's fields compute never settle: ${computed
			.map(({ name }) => name)
			.join(", ")} still change after ${ITERATION_BOUND} rounds. ` +
			"A deployment recorded from values that never agreed with themselves would locate " +
			"funds at an address nobody checked.",
	);
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
	const wiring = Refusal.attempt(() => tapleafWiring(field.node));
	const found = new Set<string>();

	for (const value of Object.values(wiring?.wiring ?? {})) {
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
	wiring: Record<string, unknown>;
};

function tapleafWiring(node: Record<string, unknown>): TapleafWiring {
	const declared = asRecord(node.params);

	if (!declared) {
		return { declaredAtUse: {}, wiring: {} };
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
			throw new Refusal(`Parameter ${name} names no value to compile with.`);
		}

		const type = asRecord(spec)?.type;

		if (typeof type === "string") {
			declaredAtUse[name] = type;
		}

		wiring[name] = value;
	}

	return { declaredAtUse, wiring };
}

function resolveFieldReference(name: string, text: string, scope: ReferenceScope): string {
	let found: unknown;

	try {
		found = resolveReference(text, "compileParam", scope).value;
	} catch (error) {
		if (!(error instanceof Refusal)) {
			throw error;
		}

		if (computesValue(text)) {
			return Refusal.amend(
				() => computedValue(text, "compileParam", scope),
				(reason) => `Field ${name}: ${reason}`,
			);
		}

		if (text.startsWith("$") || text.includes(".")) {
			throw new Refusal(`Field ${name}: ${error.reason}`);
		}

		return text;
	}

	if (typeof found !== "string") {
		throw new Refusal(
			`Field ${name} resolves to a value this runtime cannot record as a field yet.`,
		);
	}

	return found;
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
