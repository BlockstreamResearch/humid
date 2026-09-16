import { asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import { evaluateExpression } from "./evaluate";

type HookTarget = "args" | "instance" | "params";

const TARGETS: Record<string, HookTarget> = {
	args: "args",
	compile_params: "instance",
	instance: "instance",
	params: "params",
};

export type HookValues = { args: Record<string, string>; instance: Record<string, string> } & {
	params: Record<string, string>;
};

export type RunHookResult = { ok: false; reason: string } | { ok: true; values: HookValues };

export type DeclaredHook =
	| { kind: "absent" }
	| { kind: "malformed"; reason: string }
	| { kind: "present"; set: Record<string, unknown> };

export function actionHook(action: NormalisedAction): DeclaredHook {
	return declaredHook(action.node.on_pre_broadcast, "on_pre_broadcast");
}

export function inputHook(input: Record<string, unknown>): DeclaredHook {
	return declaredHook(input.on_resolved, "on_resolved");
}

function declaredHook(declared: unknown, at: string): DeclaredHook {
	if (declared === undefined) {
		return { kind: "absent" };
	}

	const node = asRecord(declared);

	if (!node) {
		return { kind: "malformed", reason: `${at} is not a block of assignments.` };
	}

	const set = asRecord(node.set);

	if (!set) {
		return {
			kind: "malformed",
			reason:
				node.set === undefined
					? `${at} declares a hook and nothing for it to set.`
					: `${at} sets something that is not a list of assignments.`,
		};
	}

	return { kind: "present", set };
}

export function runHook(
	set: Record<string, unknown>,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): RunHookResult {
	const values: HookValues = { args: {}, instance: {}, params: {} };
	let running = scope;

	for (const [target, expression] of Object.entries(set)) {
		const split = /^(?<namespace>[A-Za-z_][A-Za-z0-9_]*)\.(?<name>[A-Za-z_][A-Za-z0-9_]*)$/.exec(
			target,
		);
		const namespace = split?.groups?.namespace;
		const name = split?.groups?.name;

		if (!namespace || !name) {
			return { ok: false, reason: `A hook assigns to "${target}", which names no value.` };
		}

		const lane = TARGETS[namespace];

		if (!lane) {
			return {
				ok: false,
				reason: `A hook assigns to "${target}", and "${namespace}" is not something this runtime can set.`,
			};
		}

		if (typeof expression !== "string") {
			return { ok: false, reason: `The hook's value for ${target} is not an expression.` };
		}

		const evaluated = valueOf(expression, running, notes);

		if (!evaluated.ok) {
			return { ok: false, reason: `Setting ${target}: ${evaluated.reason}` };
		}

		values[lane][name] = evaluated.value;
		running = foldInto(running, lane, name, evaluated.value);
	}

	return { ok: true, values };
}

function valueOf(
	expression: string,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; value: string } {
	const evaluated = evaluateExpression(expression, "expression", scope, notes);

	if (evaluated.ok) {
		return { ok: true, value: String(evaluated.value) };
	}

	const named = resolveReference(expression, "expression", scope, notes);

	return named.ok && typeof named.value === "string"
		? { ok: true, value: named.value }
		: { ok: false, reason: evaluated.reason };
}

export function inputHookScope(
	scope: ReferenceScope,
	self: Record<string, unknown>,
): ReferenceScope {
	const bare: Record<string, unknown> = {};

	for (const key of ["asset", "reissuance_token"]) {
		if (self[key] !== undefined) {
			bare[key] = self[key];
		}
	}

	return { ...scope, params: { ...scope.params, ...bare } };
}

export function withHookValues(scope: ReferenceScope, values: HookValues): ReferenceScope {
	return {
		...scope,
		args: { ...scope.args, ...values.args },
		instance: { ...scope.instance, ...values.instance },
		params: { ...scope.params, ...values.params },
	};
}

function foldInto(
	scope: ReferenceScope,
	lane: HookTarget,
	name: string,
	value: string,
): ReferenceScope {
	return { ...scope, [lane]: { ...scope[lane], [name]: value } };
}
