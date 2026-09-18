import { asArray, asRecord } from "./json";
import { declaredFields, type NormalisedAction, type NormalisedManifest } from "./normalise";
import { namedUtxoTypes } from "./sites";

export type ReferenceForm = "args" | "bare" | "input-attribute" | "instance" | "params";

export type ParsedReference = {
	attribute?: string;
	form: ReferenceForm;
	name: string;
};

export type ReferenceScope = {
	args?: Record<string, unknown>;
	inputs?: Record<string, Record<string, unknown>>;
	instance?: Record<string, unknown>;
	params: Record<string, unknown>;
};

export type ReferenceResolution =
	| { form: ReferenceForm; ok: true; value: unknown }
	| { ok: false; reason: string };

export type ReferenceSiteKind =
	| "amount"
	| "asset"
	| "compileParam"
	| "destination"
	| "expression"
	| "issuedAmount"
	| "stateLeaf"
	| "witnessKey"
	| "witnessValue";

const SITES: Record<ReferenceSiteKind, { accepts: ReferenceForm[]; describes: string }> = {
	amount: {
		accepts: ["instance", "params", "args", "input-attribute", "bare"],
		describes: "an amount",
	},
	asset: {
		accepts: ["instance", "params", "args", "input-attribute", "bare"],
		describes: "an asset",
	},
	compileParam: {
		accepts: ["instance", "params", "args", "bare"],
		describes: "a compile parameter",
	},
	destination: { accepts: ["params"], describes: "a destination" },
	expression: {
		accepts: ["instance", "params", "args", "input-attribute", "bare"],
		describes: "an expression",
	},
	issuedAmount: {
		accepts: ["instance", "params", "args", "bare"],
		describes: "an issued amount",
	},
	stateLeaf: {
		accepts: ["instance", "params", "args", "bare"],
		describes: "part of a state leaf",
	},
	witnessKey: {
		accepts: ["instance", "params", "args", "bare"],
		describes: "a witness key",
	},
	witnessValue: {
		accepts: ["instance", "params", "args"],
		describes: "part of a witness value",
	},
};

const NAMESPACES: Record<string, ReferenceForm> = {
	args: "args",
	instance: "instance",
	params: "params",
};

const NAME = "[A-Za-z_][A-Za-z0-9_]*";
const REFERENCE = new RegExp(`^\\$?(?<head>${NAME})(?:\\.(?<tail>${NAME}))?$`);

export function parseReference(text: string): ParsedReference | undefined {
	const match = REFERENCE.exec(text.trim());
	const head = match?.groups?.head;

	if (!head) {
		return undefined;
	}

	const tail = match.groups?.tail;

	if (tail === undefined) {
		return { form: "bare", name: head };
	}

	const form = NAMESPACES[head];

	if (form) {
		return { form, name: tail };
	}

	return { attribute: tail, form: "input-attribute", name: head };
}

export function resolveReference(
	text: string,
	site: ReferenceSiteKind,
	scope: ReferenceScope,
): ReferenceResolution {
	const reference = parseReference(text);
	const accepted = SITES[site];

	if (!reference) {
		return { ok: false, reason: `"${text}" is not a reference.` };
	}

	if (!accepted.accepts.includes(reference.form)) {
		return { ok: false, reason: `"${text}" cannot be used as ${accepted.describes}.` };
	}

	const found = lookUp(reference, scope);

	return found.ok ? { form: reference.form, ok: true, value: found.value } : found;
}

function lookUp(
	reference: ParsedReference,
	scope: ReferenceScope,
): { ok: true; value: unknown } | { ok: false; reason: string } {
	switch (reference.form) {
		case "args": {
			return read(scope.args, reference.name, "args");
		}

		case "bare": {
			if (reference.name in scope.params) {
				return { ok: true, value: scope.params[reference.name] };
			}

			if (scope.args && reference.name in scope.args) {
				return { ok: true, value: scope.args[reference.name] };
			}

			return {
				ok: false,
				reason: `"${reference.name}" is neither a parameter nor an argument of this action.`,
			};
		}

		case "input-attribute": {
			const input = scope.inputs?.[reference.name];

			if (!input) {
				return {
					ok: false,
					reason: `"${reference.name}" is not an input this action resolved.`,
				};
			}

			return read(input, reference.attribute ?? "", `input ${reference.name}`);
		}

		case "instance": {
			return read(scope.instance, reference.name, "instance");
		}

		case "params": {
			return read(scope.params, reference.name, "params");
		}
	}
}

function read(
	source: Record<string, unknown> | undefined,
	name: string,
	label: string,
): { ok: true; value: unknown } | { ok: false; reason: string } {
	if (!source) {
		return { ok: false, reason: `This request carries no ${label} to resolve "${name}" against.` };
	}

	if (!(name in source)) {
		return { ok: false, reason: `${label} carries no "${name}".` };
	}

	return { ok: true, value: source[name] };
}

export type ReferenceOccurrence = {
	at: string;
	site: ReferenceSiteKind;
	text: string;
};

const DESTINATION_KEYWORDS = new Set(["change", "wallet"]);

export function actionReferences(
	manifest: NormalisedManifest,
	action: NormalisedAction,
): ReferenceOccurrence[] {
	const found: ReferenceOccurrence[] = [];
	const where = `action ${action.name}`;

	const add = (site: ReferenceSiteKind, at: string, value: unknown): void => {
		if (typeof value === "string") {
			found.push({ at, site, text: value });
		}
	};

	const addWiring = (at: string, wiring: unknown): void => {
		for (const [name, value] of Object.entries(asRecord(wiring) ?? {})) {
			add("compileParam", `${at} / ${name}`, value);
		}
	};

	for (const declared of asArray(action.node.inputs)) {
		const input = asRecord(declared);

		addWiring(
			`${where} / input ${identifierOf(input)}`,
			asRecord(input?.utxo_source)?.compile_params,
		);
	}

	for (const declared of asArray(action.node.outputs)) {
		const output = asRecord(declared);
		const at = `${where} / output ${identifierOf(output)}`;
		const destination = output?.destination;

		addWiring(at, asRecord(destination)?.compile_params);
		add("amount", `${at} / amount_sat`, output?.amount_sat);

		if (typeof destination === "string" && !DESTINATION_KEYWORDS.has(destination)) {
			add("destination", `${at} / destination`, destination);
		}
	}

	for (const [name, value] of Object.entries(
		asRecord(asRecord(action.node.create_instance)?.fields) ?? {},
	)) {
		const at = `${where} / new deployment / ${name}`;

		add("compileParam", at, value);

		for (const [param, spec] of Object.entries(asRecord(asRecord(value)?.params) ?? {})) {
			add(
				"compileParam",
				`${at} / ${param}`,
				typeof spec === "string" ? spec : asRecord(spec)?.value,
			);
		}
	}

	for (const name of namedUtxoTypes(action.node)) {
		addWiring(
			`utxo type ${name} / script`,
			asRecord(asRecord(manifest.utxoTypes[name])?.script)?.compile_params,
		);
	}

	return found;
}

export function instanceReferences(
	manifest: NormalisedManifest,
	action: NormalisedAction,
	supplied: Record<string, unknown>,
): ReferenceOccurrence[] {
	const fields = declaredFields(manifest, action);
	const created = new Set(
		Object.keys(asRecord(asRecord(action.node.create_instance)?.fields) ?? {}),
	);

	return actionReferences(manifest, action).filter((occurrence) => {
		const reference = parseReference(occurrence.text);

		if (reference === undefined || created.has(reference.name)) {
			return false;
		}

		if (reference.form === "instance") {
			return true;
		}

		return (
			reference.form === "bare" &&
			occurrence.site === "compileParam" &&
			reference.name in fields &&
			!(reference.name in supplied)
		);
	});
}

function identifierOf(node: Record<string, unknown> | undefined): string {
	return typeof node?.id === "string" ? node.id : "(unnamed)";
}
