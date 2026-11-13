import { Refusal } from "../refusal";
import { asArray, asRecord } from "./json";
import { type Action, type Manifest } from "./manifest";
import { namedUtxoTypes } from "./sites";

export type ReferenceForm = "bare" | "input-attribute" | "instance" | "params";

export type ParsedReference = {
	attribute?: string;
	form: ReferenceForm;
	name: string;
};

export type ReferenceScope = {
	fee?: bigint;
	inputs?: Record<string, Record<string, unknown>>;
	instance?: Record<string, unknown>;
	params: Record<string, unknown>;
	self?: Record<string, unknown>;
};

export type ReferenceResolution = { form: ReferenceForm; value: unknown };

export type ReferenceSiteKind =
	| "amount"
	| "asset"
	| "compileParam"
	| "destination"
	| "entropy"
	| "expression"
	| "field"
	| "issuedAmount"
	| "stateLeaf"
	| "witnessKey"
	| "witnessValue";

const SITES: Record<ReferenceSiteKind, { accepts: ReferenceForm[]; describes: string }> = {
	amount: {
		accepts: ["instance", "params", "input-attribute", "bare"],
		describes: "an amount",
	},
	asset: {
		accepts: ["instance", "params", "input-attribute", "bare"],
		describes: "an asset",
	},
	compileParam: {
		accepts: ["instance", "params", "bare"],
		describes: "a compile parameter",
	},
	destination: { accepts: ["instance", "params"], describes: "a destination" },
	entropy: { accepts: ["instance", "params"], describes: "an issuance entropy" },
	expression: {
		accepts: ["instance", "params", "input-attribute", "bare"],
		describes: "an expression",
	},
	field: {
		accepts: ["instance", "params", "input-attribute", "bare"],
		describes: "a deployment field",
	},
	issuedAmount: {
		accepts: ["instance", "params", "bare"],
		describes: "an issued amount",
	},
	stateLeaf: {
		accepts: ["instance", "params", "bare"],
		describes: "part of a state leaf",
	},
	witnessKey: {
		accepts: ["instance", "params", "bare"],
		describes: "a witness key",
	},
	witnessValue: {
		accepts: ["instance", "params"],
		describes: "part of a witness value",
	},
};

const NAMESPACES: Record<string, ReferenceForm> = {
	instance: "instance",
	params: "params",
};

const PROGRAM_ARGUMENTS = new Set<ReferenceSiteKind>(["compileParam", "stateLeaf"]);

const NAME = "[A-Za-z_][A-Za-z0-9_]*";
const REFERENCE = new RegExp(`^(?<head>${NAME})(?:\\.(?<tail>${NAME}))?$`);

export const RESERVED_INPUT_IDS = new Set(Object.keys(NAMESPACES));

export function parseReference(text: string): ParsedReference | undefined {
	const groups = REFERENCE.exec(text.trim())?.groups;
	const head = groups?.head;

	if (!head) {
		return undefined;
	}

	const tail = groups.tail;

	if (tail === undefined) {
		return { form: "bare", name: head };
	}

	const form = NAMESPACES[head];

	return form ? { form, name: tail } : { attribute: tail, form: "input-attribute", name: head };
}

export function resolveReference(
	text: string,
	site: ReferenceSiteKind,
	scope: ReferenceScope,
): ReferenceResolution {
	const reference = parseReference(text);
	const accepted = SITES[site];

	if (!reference) {
		throw new Refusal(`"${text}" is not a reference.`);
	}

	if (!accepted.accepts.includes(reference.form)) {
		throw new Refusal(`"${text}" cannot be used as ${accepted.describes}.`);
	}

	return { form: reference.form, value: lookUp(reference, site, scope) };
}

function lookUp(
	reference: ParsedReference,
	site: ReferenceSiteKind,
	scope: ReferenceScope,
): unknown {
	switch (reference.form) {
		case "bare": {
			const name = reference.name;

			if (PROGRAM_ARGUMENTS.has(site)) {
				return lookUp({ form: "instance", name }, site, scope);
			}

			if (name === "fee" && scope.fee !== undefined) {
				return scope.fee;
			}

			if (scope.self && Object.hasOwn(scope.self, name)) {
				return scope.self[name];
			}

			throw new Refusal(
				`"${name}" names nothing here: a parameter is params.${name}, a deployment field instance.${name}.`,
			);
		}

		case "input-attribute": {
			const input = scope.inputs?.[reference.name];

			if (!input) {
				throw new Refusal(`"${reference.name}" is not an input this action resolved.`);
			}

			return read(input, reference.attribute ?? "", `input ${reference.name}`);
		}

		case "instance": {
			const fromParams =
				!(reference.name in (scope.instance ?? {})) && reference.name in scope.params;

			return read(fromParams ? scope.params : scope.instance, reference.name, "instance");
		}

		case "params": {
			return read(scope.params, reference.name, "params");
		}
	}
}

function read(source: Record<string, unknown> | undefined, name: string, label: string): unknown {
	if (!source) {
		throw new Refusal(`This request carries no ${label} to resolve "${name}" against.`);
	}

	if (!(name in source)) {
		throw new Refusal(`${label} carries no "${name}".`);
	}

	return source[name];
}

export type ReferenceOccurrence = {
	at: string;
	site: ReferenceSiteKind;
	text: string;
};

const DESTINATION_KEYWORDS = new Set(["change", "wallet"]);

export function actionReferences(manifest: Manifest, action: Action): ReferenceOccurrence[] {
	const found: ReferenceOccurrence[] = [];
	const where = `action ${action.name}`;

	const add = (site: ReferenceSiteKind, at: string, value: unknown): void => {
		if (typeof value === "string") {
			found.push({ at, site, text: value });
		}
	};

	const addWiring = (
		at: string,
		wiring: unknown,
		site: ReferenceSiteKind = "compileParam",
	): void => {
		for (const [name, value] of Object.entries(asRecord(wiring) ?? {})) {
			add(site, `${at} / ${name}`, value);
		}
	};
	const addSite = (at: string, reference: unknown): void => {
		addWiring(at, asRecord(reference)?.compile_params);
		addWiring(at, asRecord(reference)?.args, "field");
	};

	for (const declared of asArray(action.node.inputs)) {
		const input = asRecord(declared);

		addSite(`${where} / input ${identifierOf(input)}`, input?.utxo_source);
	}

	for (const declared of asArray(action.node.outputs)) {
		const output = asRecord(declared);
		const at = `${where} / output ${identifierOf(output)}`;
		const destination = output?.destination;

		addSite(at, destination);
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
		const declared = manifest.utxoType(name);
		const params = asRecord(declared?.params);

		if (params === undefined) {
			addWiring(`utxo type ${name} / script`, asRecord(declared?.script)?.compile_params);
		}

		for (const [param, definition] of Object.entries(params ?? {})) {
			add("field", `utxo type ${name} / param ${param}`, asRecord(definition)?.default);
		}
	}

	return found;
}

export function instanceReferences(
	manifest: Manifest,
	action: Action,
	supplied: Record<string, unknown>,
): ReferenceOccurrence[] {
	const fields = manifest.templateFields(action);
	const created = new Set(
		Object.keys(asRecord(asRecord(action.node.create_instance)?.fields) ?? {}),
	);
	const params = asRecord(action.node.params) ?? {};

	return actionReferences(manifest, action).filter((occurrence) => {
		const reference = parseReference(occurrence.text);

		if (reference === undefined || created.has(reference.name)) {
			return false;
		}

		if (reference.form === "instance") {
			return !(reference.name in params);
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
