import { asRecord } from "./json";

export type NormalisedAction = {
	boundTo?: string;
	isConstructor: boolean;
	name: string;
	node: Record<string, unknown>;
};

export type NormalisedManifest = {
	actions: NormalisedAction[];
	buildMode: BuildMode;
	chain?: string;
	node: Record<string, unknown>;
	protocol?: string;
	raw: Record<string, unknown>;
	utxoTypes: Record<string, unknown>;
};

export type BuildMode = { includeDebugSymbols: boolean; ok: true } | { ok: false; reason: string };

export function normaliseManifest(raw: Record<string, unknown>): NormalisedManifest {
	return {
		actions: normaliseActions(raw),
		buildMode: readBuildMode(raw),
		chain: asString(raw.chain),
		node: { ...raw },
		protocol: asString(raw.protocol),
		raw,
		utxoTypes: asRecord(raw.utxo_types) ?? {},
	};
}

function readBuildMode(raw: Record<string, unknown>): BuildMode {
	const declared = asRecord(raw.simplicity_hl)?.debug_symbols;

	if (declared !== undefined && typeof declared !== "boolean") {
		return {
			ok: false,
			reason: `This protocol declares simplicity_hl.debug_symbols as ${JSON.stringify(declared)}, which is neither on nor off.`,
		};
	}

	return { includeDebugSymbols: declared === true, ok: true };
}

export function findAction(
	manifest: NormalisedManifest,
	name: string,
): NormalisedAction | undefined {
	return manifest.actions.find((action) => action.name === name);
}

export function declaredFields(
	manifest: NormalisedManifest,
	action: NormalisedAction,
): Record<string, unknown> {
	return action.boundTo === undefined
		? {}
		: (asRecord(asRecord(templates(manifest.raw)[action.boundTo])?.fields) ?? {});
}

export type NormalisedInstance = {
	fields: Record<string, unknown>;
	providedInputs: Record<string, unknown>;
	template?: string;
};

export function normaliseInstance(raw: Record<string, unknown> | undefined): NormalisedInstance {
	const nested = asRecord(raw?.instance);
	const template = asString(nested?.template);

	return {
		fields: asRecord(nested?.fields) ?? {},
		providedInputs: asRecord(raw?.provided_inputs) ?? {},
		...(template === undefined ? {} : { template }),
	};
}

function normaliseActions(raw: Record<string, unknown>): NormalisedAction[] {
	const actions = Object.entries(asRecord(raw.actions) ?? {}).map(([name, node]) =>
		normaliseAction(name, node, undefined),
	);

	for (const [template, declared] of Object.entries(templates(raw))) {
		for (const [name, node] of Object.entries(asRecord(asRecord(declared)?.actions) ?? {})) {
			actions.push(normaliseAction(name, node, template));
		}
	}

	return actions.filter((action) => action !== undefined);
}

function normaliseAction(
	name: string,
	declared: unknown,
	boundTo: string | undefined,
): NormalisedAction | undefined {
	const node = asRecord(declared);

	if (!node) {
		return undefined;
	}

	return {
		...(boundTo === undefined ? {} : { boundTo }),
		isConstructor: asRecord(node.create_instance) !== undefined,
		name,
		node,
	};
}

function templates(raw: Record<string, unknown>): Record<string, unknown> {
	return asRecord(raw.contract_templates) ?? {};
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
