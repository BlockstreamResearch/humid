import { asRecord } from "../document/json";
import type { NormalisationNote, NormalisedAction } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { evaluateExpression } from "./evaluate";

/**
 * Where a hook writes, once the namespace it names is read.
 *
 * Three namespaces are assignable and they are the same three a reference can read from, so
 * a value a hook sets is reachable afterwards by the name it was set under. The fourth
 * spelling, the deprecated one, writes where the newer one does — the rename applies to
 * assignment targets as much as to reads.
 */
type HookTarget = "args" | "instance" | "params";

const TARGETS: Record<string, HookTarget> = {
	args: "args",
	compile_params: "instance",
	instance: "instance",
	params: "params",
};

/** What a hook produced, ready to be folded into the scope everything after it reads. */
export type HookValues = { args: Record<string, string>; instance: Record<string, string> } & {
	params: Record<string, string>;
};

export type RunHookResult = { ok: false; reason: string } | { ok: true; values: HookValues };

/** The hook an action runs once every input is resolved and before anything is built. */
export function actionHook(action: NormalisedAction): Record<string, unknown> | undefined {
	return asRecord(asRecord(action.node.on_pre_broadcast)?.set);
}

/** The hook one input runs as soon as that input is resolved. */
export function inputHook(input: Record<string, unknown>): Record<string, unknown> | undefined {
	return asRecord(asRecord(input.on_resolved)?.set);
}

/**
 * Runs one hook's assignments, in the order the document writes them.
 *
 * **Order is the contract, not an implementation detail.** The format says assignments run
 * in declaration order and that a later one may read an earlier one's result, so each
 * assignment is evaluated against a scope that already carries everything set before it.
 * Evaluating them together against one frozen scope would silently produce a different
 * transaction for a document that reads its own earlier line.
 *
 * **A target is a namespace and a name.** `instance.X` writes a field of the deployment,
 * `params.X` an action parameter, `args.X` an argument. A target naming anything else is
 * refused rather than dropped: a hook that silently sets nothing is a document whose later
 * lines read a value that was never written.
 */
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

		const evaluated = evaluateExpression(expression, "amount", running, notes);

		if (!evaluated.ok) {
			return { ok: false, reason: `Setting ${target}: ${evaluated.reason}` };
		}

		const value = String(evaluated.value);

		values[lane][name] = value;
		running = foldInto(running, lane, name, value);
	}

	return { ok: true, values };
}

/**
 * The scope one input's own hook reads.
 *
 * Inside `on_resolved`, two bare words mean this input rather than something in scope:
 * `asset` is the asset it holds — the one it just issued, when it issued one — and
 * `reissuance_token` the token that issuance produced. They are bare rather than prefixed
 * because the input naming them is the input being resolved, so there is nothing to
 * qualify them with.
 */
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

/** Folds every hook's output back into one scope, with the deployment and parameters merged. */
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
