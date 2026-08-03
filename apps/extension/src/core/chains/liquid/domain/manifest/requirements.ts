import type { ActionRequirements, MissingPart, ParsedLiquidProcessCtParams } from "./types";

/**
 * Works out what the chosen action actually needs from the request, and what of that is
 * absent — so a request can be refused before anything is built, naming what was missing.
 *
 * It answers the question by reading the action, not by checking the request's shape: a
 * manifest with no covenant parameters needs no instance file, and an action that creates
 * rather than spends reads nothing from state. Requiring all six parts of every request
 * would refuse valid ones; requiring none would fail later and less legibly.
 *
 * Scope note: this walks the action looking for four things — referenced contract sources,
 * `instance.` references, state-file lookups, and declared parameters. It is deliberately
 * not a general construct registry; that is a later slice's job, and this should be
 * replaced by it rather than grown.
 */
export function resolveActionRequirements(
	request: ParsedLiquidProcessCtParams,
): ActionRequirements {
	const action = findAction(request.manifest, request.action);

	if (!action) {
		return {
			missing: [
				{
					part: "params",
					reason: `The manifest declares no action named "${request.action}".`,
				},
			],
			required: [],
		};
	}

	const required: ActionRequirements["required"] = [];
	const missing: MissingPart[] = [];

	const sources = referencedContractSources(request.manifest, action);

	if (sources.length > 0) {
		required.push("contractSources");

		const absent = sources.filter((path) => !(path in request.contractSources));

		if (absent.length > 0) {
			missing.push({
				keys: absent,
				part: "contractSources",
				reason: "The action builds contracts whose source was not supplied.",
			});
		}
	}

	const params = declaredParams(action);
	const unfilled = params.filter((name) => !(name in request.params));

	if (params.length > 0) {
		required.push("params");
	}

	if (unfilled.length > 0) {
		missing.push({
			keys: unfilled,
			part: "params",
			reason: "The action declares parameters the request did not fill.",
		});
	}

	if (referencesInstance(action)) {
		required.push("instance");

		if (!request.instance) {
			missing.push({
				part: "instance",
				reason: "The action reads this deployment's field values.",
			});
		}
	}

	if (readsState(action)) {
		required.push("state");

		if (!request.state) {
			missing.push({
				part: "state",
				reason: "The action spends a covenant UTXO, which is located through the state file.",
			});
		}
	}

	return { missing, required };
}

/**
 * Finds an action by name. Manifests declare them either flat under `actions` or grouped
 * as `methods` inside a class, and a file may carry both; the two are structurally
 * identical, so either spelling resolves here.
 */
function findAction(
	manifest: Record<string, unknown>,
	name: string,
): Record<string, unknown> | undefined {
	const flat = asRecord(manifest.actions)?.[name];

	if (isRecord(flat)) {
		return flat;
	}

	const classes = asRecord(manifest.classes);

	for (const declared of Object.values(classes ?? {})) {
		const method = asRecord(asRecord(declared)?.methods)?.[name];

		if (isRecord(method)) {
			return method;
		}
	}

	return undefined;
}

/** Contract source paths the action reaches, through the utxo types it names. */
function referencedContractSources(
	manifest: Record<string, unknown>,
	action: Record<string, unknown>,
): string[] {
	const utxoTypes = asRecord(manifest.utxo_types) ?? {};
	const named = new Set(collectStrings(action, "utxo_type"));
	const paths = new Set<string>();

	for (const [name, declared] of Object.entries(utxoTypes)) {
		if (!named.has(name)) {
			continue;
		}

		const source = asRecord(asRecord(declared)?.script)?.source;

		if (typeof source === "string") {
			paths.add(source);
		}
	}

	return [...paths];
}

/** Parameter names the action declares and therefore expects the request to fill. */
function declaredParams(action: Record<string, unknown>): string[] {
	const params = asRecord(action.params) ?? {};

	// A param carrying a `source` or a `formula` is derived rather than prompted for.
	return Object.entries(params)
		.filter(([, declared]) => {
			const record = asRecord(declared);

			return !record || (!("source" in record) && !("formula" in record));
		})
		.map(([name]) => name);
}

/** Whether the action reads this deployment's field values under either spelling. */
function referencesInstance(action: Record<string, unknown>): boolean {
	return collectStringValues(action).some(
		(value) => /(^|\$)instance\./.test(value) || /(^|\$)compile_params\./.test(value),
	);
}

/** Whether the action spends a covenant UTXO, which is a lookup into the state file. */
function readsState(action: Record<string, unknown>): boolean {
	const inputs = Array.isArray(action.inputs) ? action.inputs : [];

	return inputs.some((input) => {
		const source = asRecord(input)?.utxo_source;

		return isRecord(source) && "utxo_type" in source;
	});
}

/** Every string value under `key`, at any depth. */
function collectStrings(value: unknown, key: string): string[] {
	const found: string[] = [];

	walk(value, (node) => {
		const candidate = node[key];

		if (typeof candidate === "string") {
			found.push(candidate);
		}
	});

	return found;
}

/** Every string value at any depth, used to spot reference-shaped text. */
function collectStringValues(value: unknown): string[] {
	const found: string[] = [];

	walk(value, (node) => {
		for (const entry of Object.values(node)) {
			if (typeof entry === "string") {
				found.push(entry);
			}
		}
	});

	return found;
}

function walk(value: unknown, visit: (node: Record<string, unknown>) => void): void {
	if (Array.isArray(value)) {
		for (const entry of value) {
			walk(entry, visit);
		}

		return;
	}

	if (!isRecord(value)) {
		return;
	}

	visit(value);

	for (const entry of Object.values(value)) {
		walk(entry, visit);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return isRecord(value) ? value : undefined;
}
