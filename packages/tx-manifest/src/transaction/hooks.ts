import { Refusal } from "../refusal";
import type { Scope } from "../values/scope";

type HookTarget = "instance" | "params";

const TARGETS: Record<string, HookTarget> = { instance: "instance", params: "params" };

export type HookValues = Record<HookTarget, Record<string, string>>;

export function runHook(set: Record<string, string>, scope: Scope): HookValues {
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

		const value = Refusal.amend(
			() => valueOf(expression, running),
			(reason) => `Setting ${target}: ${reason}`,
		);

		values[lane][name] = value;
		running =
			lane === "params"
				? running.withParams({ [name]: value })
				: running.withInstance({ [name]: value });
	}

	return values;
}

function valueOf(expression: string, scope: Scope): string {
	try {
		return String(scope.integer(expression, "expression"));
	} catch (error) {
		const named = Refusal.attempt(() => scope.reference(expression, "expression"));

		if (typeof named === "string") {
			return named;
		}

		throw error;
	}
}

export function inputHookScope(scope: Scope, self: Record<string, unknown>): Scope {
	const attributes: Record<string, unknown> = {};

	for (const key of ["asset", "issuance_entropy", "issued_asset", "reissuance_token"]) {
		if (self[key] !== undefined) {
			attributes[key] = self[key];
		}
	}

	if (self.issued_asset !== undefined) {
		attributes.asset = self.issued_asset;
	}

	return scope.forHook(attributes);
}

export function withHookValues(scope: Scope, values: HookValues): Scope {
	return scope.withInstance(values.instance).withParams(values.params);
}
