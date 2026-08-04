import { resolveCompileParams } from "./compileParams";
import { asArray, asRecord } from "./json";
import type { NormalisationNote, NormalisedAction } from "./normalise";
import type { ReferenceScope } from "./references";

/**
 * What the first round of iteration stands a covenant hash on.
 *
 * Thirty-two zero bytes, matching the reference implementation. It is not a plausible hash
 * and is not meant to be — it exists so a contract whose parameters name a hash that does
 * not exist yet can still be compiled once, which is what makes the second round possible.
 */
export const COVENANT_HASH_SEED = "0".repeat(64);

/**
 * How many rounds a set of mutually referencing hashes gets before the action fails.
 *
 * A chain of n covenants each naming the next settles in n rounds, so the bound is a limit
 * on how deep a protocol may nest rather than on how hard convergence is. Eight is far past
 * anything the corpus contains and small enough that an unstable manifest fails quickly.
 */
export const ITERATION_BOUND = 8;

/** Compiles a contract with its arguments and returns the hash of its scriptPubKey. */
export type HashCovenant = (input: { argumentsJson: string; source: string }) => string;

export type ComputedParamsResult =
	| { ok: false; reason: string }
	| { ok: true; rounds: number; values: Record<string, string> };

/**
 * Works out the parameters a manifest computes rather than asks for.
 *
 * A `tapleaf` parameter is a covenant's script hash, and a covenant's compile parameters can
 * name another covenant's hash — including, in both directions at once. There is no order in
 * which such a pair can be evaluated, so it is not evaluated in an order: every computed
 * value starts at a seed, all of them are recomputed together, and the round that reproduces
 * its own input is the answer.
 *
 * A chain that is not circular converges as fast as its depth, so this covers the ordinary
 * case without a separate topological pass — the ordering falls out of the iteration.
 *
 * **Exceeding the bound fails.** The alternative is returning the last round's values, which
 * are an address derived from something that never agreed with itself; the wallet would then
 * compare that address against the chain and refuse anyway, having spent the work, or worse,
 * pay to it. Failing here says which of the two happened.
 */
export function resolveComputedParams(
	action: NormalisedAction,
	input: {
		contractSources: Record<string, string>;
		hashCovenant: HashCovenant;
		notes?: NormalisationNote[];
		scope: ReferenceScope;
	},
): ComputedParamsResult {
	const declared = computedDeclarations(action, input.contractSources, input.scope);

	if (!declared.ok) {
		return declared;
	}

	if (declared.params.length === 0) {
		return { ok: true, rounds: 0, values: {} };
	}

	let values: Record<string, string> = Object.fromEntries(
		declared.params.map(({ name }) => [name, COVENANT_HASH_SEED]),
	);

	for (let round = 1; round <= ITERATION_BOUND; round += 1) {
		const next: Record<string, string> = {};

		for (const { declaredTypes, name, node, source } of declared.params) {
			const scope: ReferenceScope = {
				...input.scope,
				params: { ...input.scope.params, ...values },
			};
			const resolved = resolveCompileParams(
				wiringFor(node, scope.params, name),
				declaredTypes,
				scope,
				input.notes,
			);

			if (!resolved.ok) {
				return { ok: false, reason: `Computing ${name}: ${resolved.reason}` };
			}

			next[name] = input.hashCovenant({
				argumentsJson: JSON.stringify(resolved.arguments),
				source,
			});
		}

		if (declared.params.every(({ name }) => next[name] === values[name])) {
			return { ok: true, rounds: round, values: next };
		}

		values = next;
	}

	return {
		ok: false,
		reason:
			`The covenant hashes this action computes never settle: ${declared.params
				.map(({ name }) => name)
				.join(", ")} still change after ${ITERATION_BOUND} rounds. ` +
			"A transaction built on values that never agreed with themselves would pay to an " +
			"address nobody checked.",
	};
}

type ComputedParam = {
	declaredTypes: Record<string, string>;
	name: string;
	node: Record<string, unknown>;
	source: string;
};

/**
 * Every parameter the action computes, with the contract each one is the hash of.
 *
 * A parameter the request already supplied is not computed — a value that arrived is a value,
 * whatever the manifest says it would otherwise work out.
 */
function computedDeclarations(
	action: NormalisedAction,
	contractSources: Record<string, string>,
	scope: ReferenceScope,
): { ok: false; reason: string } | { ok: true; params: ComputedParam[] } {
	const declaredTypes = declaredParamTypes(action.node);
	const params: ComputedParam[] = [];

	for (const [name, declared] of Object.entries(asRecord(action.node.params) ?? {})) {
		const node = asRecord(declared);
		const compute = node?.compute;

		if (!node || compute === undefined || name in scope.params) {
			continue;
		}

		if (compute !== "tapleaf") {
			return {
				ok: false,
				reason:
					`Parameter ${name} is computed by "${String(compute)}", which this runtime does not ` +
					"implement. Honouring it means executing a contract while building the " +
					"transaction, not merely compiling one.",
			};
		}

		if (asArray(node.extra_leaves).length > 0) {
			return {
				ok: false,
				reason: `Parameter ${name} carries extra_leaves, which this runtime does not encode yet.`,
			};
		}

		const simf = node.simf;

		if (typeof simf !== "string") {
			return { ok: false, reason: `Parameter ${name} names no contract to compute from.` };
		}

		const source = contractSources[simf];

		if (source === undefined) {
			return { ok: false, reason: `The source of ${simf} was not supplied.` };
		}

		params.push({ declaredTypes, name, node, source });
	}

	return { ok: true, params };
}

/**
 * The compile parameters one computed value is worked out from.
 *
 * Three modes, and the third is the one that matters. A declared `params` map is used as
 * written. Omitting it switches the format into auto-populate: every parameter in scope is
 * passed, minus the one being computed, because a contract cannot be compiled with its own
 * hash as an input.
 *
 * `depends_on` narrows auto-populate to a named list, and the reference implementation says
 * it exists to break apparent circular dependencies — which is exactly what auto-populate
 * creates. Handing every covenant every parameter makes each one look dependent on the
 * others whether or not its contract reads them, and a set of hashes that genuinely depend
 * on each other has no answer to converge to. So `depends_on: []` is not an empty setting;
 * it is a protocol saying this covenant consumes nothing, which is what turns a cycle back
 * into a chain.
 */
function wiringFor(
	node: Record<string, unknown>,
	params: Record<string, unknown>,
	exclude: string,
): Record<string, unknown> {
	const declared = asRecord(node.params);

	if (declared) {
		return declared;
	}

	const narrowed = node.depends_on;
	const names = Array.isArray(narrowed)
		? narrowed.filter((name): name is string => typeof name === "string")
		: Object.keys(params);

	return Object.fromEntries(
		names.filter((name) => name !== exclude).map((name) => [name, `params.${name}`]),
	);
}

/**
 * The declared types of an action's parameters, with every computed one defaulted.
 *
 * A `tapleaf` parameter is a covenant's script hash and is therefore thirty-two bytes by
 * construction, whatever the manifest does or does not say — so it needs no declaration, and
 * a manifest that omits one is not thereby unbuildable.
 */
function declaredParamTypes(action: Record<string, unknown>): Record<string, string> {
	const types: Record<string, string> = {};

	for (const [name, declared] of Object.entries(asRecord(action.params) ?? {})) {
		const record = asRecord(declared);
		const type = record?.type;

		if (typeof type === "string") {
			types[name] = type;
		} else if (record?.compute === "tapleaf") {
			types[name] = "bytes32";
		}
	}

	return types;
}
