import { asRecord } from "../document/json";
import type { Action } from "../document/manifest";
import { type ReferenceScope, resolveReference } from "../document/references";
import { Refusal } from "../refusal";
import { evaluateExpression } from "./evaluate";

type HookTarget = "instance" | "params";

const TARGETS: Record<string, HookTarget> = { instance: "instance", params: "params" };

export type HookValues = Record<HookTarget, Record<string, string>>;

export type DeclaredHook =
	| { kind: "absent" }
	| { kind: "malformed"; reason: string }
	| { kind: "present"; set: Record<string, unknown> };

export function actionHook(action: Action): DeclaredHook {
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

export function runHook(set: Record<string, unknown>, scope: ReferenceScope): HookValues {
	const values: HookValues = { instance: {}, params: {} };
	let running = scope;

	for (const [target, expression] of Object.entries(set)) {
		const split = /^(?<namespace>[A-Za-z_][A-Za-z0-9_]*)\.(?<name>[A-Za-z_][A-Za-z0-9_]*)$/.exec(
			target,
		);
		const namespace = split?.groups?.namespace;
		const name = split?.groups?.name;

		if (!namespace || !name) {
			throw new Refusal(`A hook assigns to "${target}", which names no value.`);
		}

		const lane = TARGETS[namespace];

		if (!lane) {
			throw new Refusal(
				`A hook assigns to "${target}", and "${namespace}" is not something this runtime can set.`,
			);
		}

		if (typeof expression !== "string") {
			throw new Refusal(`The hook's value for ${target} is not an expression.`);
		}

		const value = Refusal.amend(
			() => valueOf(expression, running),
			(reason) => `Setting ${target}: ${reason}`,
		);

		values[lane][name] = value;
		running = foldInto(running, lane, name, value);
	}

	return values;
}

function valueOf(expression: string, scope: ReferenceScope): string {
	try {
		return String(evaluateExpression(expression, "expression", scope));
	} catch (error) {
		const named = Refusal.attempt(() => resolveReference(expression, "expression", scope).value);

		if (typeof named === "string") {
			return named;
		}

		throw error;
	}
}

export function inputHookScope(
	scope: ReferenceScope,
	self: Record<string, unknown>,
): ReferenceScope {
	const attributes: Record<string, unknown> = {};

	for (const key of ["asset", "issuance_entropy", "issued_asset", "reissuance_token"]) {
		if (self[key] !== undefined) {
			attributes[key] = self[key];
		}
	}

	if (self.issued_asset !== undefined) {
		attributes.asset = self.issued_asset;
	}

	return { ...scope, self: attributes };
}

export function withHookValues(scope: ReferenceScope, values: HookValues): ReferenceScope {
	return {
		...scope,
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
