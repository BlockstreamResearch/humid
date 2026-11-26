import type { z } from "zod";

import { quoted, type RejectToken, Refusal } from "../refusal";
import { inspectConstructs } from "./registry";
import {
	type ActionDocument,
	type InputDocument,
	type ManifestDocument,
	manifestSchema,
	type OutputDocument,
	type ProgramReference,
	type UtxoType,
} from "./schema";

export type Input = InputDocument & { label: string };
export type Output = OutputDocument & { label: string };

export type Action = Omit<ActionDocument, "inputs" | "outputs"> & {
	inputs: Input[];
	name: string;
	outputs: Output[];
	template?: string;
};

export type ProgramInput = Input & { utxo_source: ProgramReference };

const FORMAT = { major: 0, minor: 3 };
const CHAINS = new Set(["elements", "liquid"]);
const TOKENS: Record<string, RejectToken> = {
	debug_symbols: "unreadable-build-mode",
	required_index: "unbuildable-position",
};

export class Manifest {
	readonly actions: Action[];
	readonly protocol: string | undefined;
	readonly requires: string[];
	readonly simplicityHl: ManifestDocument["simplicity_hl"];
	readonly utxoTypes: Record<string, UtxoType>;
	readonly #templates: ManifestDocument["contract_templates"];

	private constructor(document: ManifestDocument) {
		this.protocol = document.protocol;
		this.requires = document.requires;
		this.simplicityHl = document.simplicity_hl;
		this.utxoTypes = document.utxo_types;
		this.#templates = document.contract_templates;
		this.actions = [
			...actionsOf(document.actions),
			...Object.entries(document.contract_templates).flatMap(([template, declared]) =>
				actionsOf(declared.actions, template),
			),
		];
	}

	static parse(raw: Record<string, unknown>): Manifest {
		refuseForeignFormat(raw.manifest_version);
		refuseForeignChain(raw.chain);
		refuseConstructs(raw);

		const parsed = manifestSchema.safeParse(raw, { reportInput: true });

		if (!parsed.success) {
			throw malformed(parsed.error);
		}

		return new Manifest(parsed.data);
	}

	get includeDebugSymbols(): boolean {
		return this.simplicityHl.debug_symbols;
	}

	action(name: string): Action | undefined {
		return this.actions.find((action) => action.name === name);
	}

	utxoType(name: string): UtxoType | undefined {
		return Object.hasOwn(this.utxoTypes, name) ? this.utxoTypes[name] : undefined;
	}

	templateFields(action: Action): Record<string, { type?: string }> {
		return action.template === undefined ? {} : (this.#templates[action.template]?.fields ?? {});
	}

	paramTypes(action: Action): Record<string, string> {
		const declared = { ...this.templateFields(action), ...action.params };

		return Object.fromEntries(
			Object.entries(declared).flatMap(([name, { type }]) =>
				type === undefined ? [] : [[name, type]],
			),
		);
	}
}

export function programInputs(action: Action): ProgramInput[] {
	return action.inputs.filter((input): input is ProgramInput => input.utxo_source !== "wallet");
}

export function programOutputs(action: Action): (Output & { reference: ProgramReference })[] {
	return action.outputs.flatMap((output) =>
		output.destination.kind === "program"
			? [{ ...output, reference: output.destination.reference }]
			: [],
	);
}

export function namedUtxoTypes(action: Action): string[] {
	return [
		...new Set([
			...programInputs(action).map((input) => input.utxo_source.utxo_type),
			...programOutputs(action).map((output) => output.reference.utxo_type),
		]),
	];
}

function actionsOf(declared: Record<string, ActionDocument>, template?: string): Action[] {
	return Object.entries(declared).map(([name, action]) =>
		Object.assign(action, {
			inputs: action.inputs.map((input, at) =>
				Object.assign(input, { label: input.id ?? `#${at + 1}` }),
			),
			name,
			outputs: action.outputs.map((output, at) =>
				Object.assign(output, { label: output.id ?? `#${at + 1}` }),
			),
			template,
		}),
	);
}

function refuseForeignFormat(declared: unknown): void {
	const [major, minor] = typeof declared === "string" ? declared.split(".").map(Number) : [];

	if (major !== FORMAT.major || minor !== FORMAT.minor) {
		throw new Refusal(
			`This document is written in manifest format ${JSON.stringify(declared)}, and this wallet reads ${FORMAT.major}.${FORMAT.minor}.`,
			"foreign-format",
		);
	}
}

function refuseForeignChain(declared: unknown): void {
	if (declared !== undefined && (typeof declared !== "string" || !CHAINS.has(declared))) {
		throw new Refusal(
			`This protocol is for ${JSON.stringify(declared)}, and this wallet builds Liquid transactions.`,
			"foreign-chain",
		);
	}
}

function refuseConstructs(raw: Record<string, unknown>): void {
	const found = inspectConstructs(raw)[0];

	if (found?.state === "unimplemented") {
		throw new Refusal(
			`This protocol uses "${found.key}" at ${found.at}, which this wallet does not implement yet.`,
			"unimplemented-construct",
		);
	}

	if (found) {
		throw new Refusal(
			`The manifest is malformed: the format defines no "${found.key}" at ${found.at}.`,
		);
	}
}

function malformed(error: z.ZodError): Refusal {
	const issue = error.issues[0];
	const path = issue?.path ?? [];
	const key = path.findLast((segment) => typeof segment === "string");

	const input = issue?.input;
	const found =
		input === undefined
			? ""
			: `, and it is ${quoted(typeof input === "string" ? input : JSON.stringify(input))}`;

	return new Refusal(
		`The manifest is malformed at ${path.map(String).join(" / ")}: ${issue?.message ?? "unreadable"}${found}.`,
		(key === undefined ? undefined : TOKENS[key]) ?? "document-fault",
	);
}
