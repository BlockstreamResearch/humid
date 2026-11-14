import { Refusal } from "../refusal";
import { type Action, type Manifest, namedUtxoTypes } from "./manifest";
import type { ProgramReference } from "./schema";

export type ReferenceForm = "bare" | "input-attribute" | "instance" | "params";

export type ParsedReference = {
	attribute?: string;
	form: ReferenceForm;
	name: string;
};

export type ReferencePosition =
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

const POSITIONS: Record<ReferencePosition, { accepts: ReferenceForm[]; describes: string }> = {
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

const PROGRAM_ARGUMENTS = new Set<ReferencePosition>(["compileParam", "stateLeaf"]);

const NAME = "[A-Za-z_][A-Za-z0-9_]*";
const REFERENCE = new RegExp(`^(?<head>${NAME})(?:\\.(?<tail>${NAME}))?$`);

export const RESERVED_INPUT_IDS = new Set(Object.keys(NAMESPACES));

const LITERAL_WORDS = new Set(["false", "true"]);

export function parseReference(text: string): ParsedReference | undefined {
	const groups = REFERENCE.exec(text.trim())?.groups;
	const head = groups?.head;

	if (!head) {
		return undefined;
	}

	const tail = groups.tail;

	if (tail === undefined) {
		return LITERAL_WORDS.has(head) ? undefined : { form: "bare", name: head };
	}

	const form = NAMESPACES[head];

	return form ? { form, name: tail } : { attribute: tail, form: "input-attribute", name: head };
}

export function acceptedReference(text: string, position: ReferencePosition): ParsedReference {
	const reference = parseReference(text);
	const accepted = POSITIONS[position];

	if (!reference) {
		throw new Refusal(`"${text}" is not a reference.`);
	}

	if (!accepted.accepts.includes(reference.form)) {
		throw new Refusal(`"${text}" cannot be used as ${accepted.describes}.`);
	}

	return reference;
}

export function readsProgramArgument(position: ReferencePosition): boolean {
	return PROGRAM_ARGUMENTS.has(position);
}

export type ReferenceOccurrence = {
	at: string;
	position: ReferencePosition;
	text: string;
};

export function actionReferences(manifest: Manifest, action: Action): ReferenceOccurrence[] {
	const found: ReferenceOccurrence[] = [];
	const where = `action ${action.name}`;

	const add = (position: ReferencePosition, at: string, value: unknown): void => {
		if (typeof value === "string") {
			found.push({ at, position, text: value });
		}
	};
	const addAll = (
		at: string,
		values: Record<string, string> | undefined,
		position: ReferencePosition,
	): void => {
		for (const [name, value] of Object.entries(values ?? {})) {
			add(position, `${at} / ${name}`, value);
		}
	};
	const addProgram = (at: string, reference: ProgramReference): void => {
		addAll(at, reference.compile_params, "compileParam");
		addAll(at, reference.args, "field");
	};

	for (const input of action.inputs) {
		if (input.utxo_source !== "wallet") {
			addProgram(`${where} / input ${input.label}`, input.utxo_source);
		}
	}

	for (const output of action.outputs) {
		const at = `${where} / output ${output.label}`;
		const { destination } = output;

		if (destination.kind === "program") {
			addProgram(at, destination.reference);
		}

		add("amount", `${at} / amount_sat`, output.amount_sat);

		if (destination.kind === "address") {
			add("destination", `${at} / destination`, destination.address);
		}
	}

	for (const [name, value] of Object.entries(action.create_instance?.fields ?? {})) {
		const at = `${where} / new deployment / ${name}`;

		add("compileParam", at, value);

		if (typeof value !== "string") {
			for (const [param, wired] of Object.entries(value.params)) {
				add("compileParam", `${at} / ${param}`, typeof wired === "string" ? wired : wired.value);
			}
		}
	}

	for (const name of namedUtxoTypes(action)) {
		const declared = manifest.utxoType(name);

		if (declared?.params === undefined) {
			addAll(`utxo type ${name} / script`, declared?.script.compile_params, "compileParam");
		}

		for (const [param, definition] of Object.entries(declared?.params ?? {})) {
			add("field", `utxo type ${name} / param ${param}`, definition.default);
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
	const created = new Set(Object.keys(action.create_instance?.fields ?? {}));

	return actionReferences(manifest, action).filter((occurrence) => {
		const reference = parseReference(occurrence.text);

		if (reference === undefined || created.has(reference.name)) {
			return false;
		}

		if (reference.form === "instance") {
			return !(reference.name in action.params);
		}

		return (
			reference.form === "bare" &&
			occurrence.position === "compileParam" &&
			reference.name in fields &&
			!(reference.name in supplied)
		);
	});
}
