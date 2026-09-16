import { asRecord } from "./json";

export type NormalisationNote = {
	at: string;
	canonical: string;
	found: string;
};

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

export type NormaliseManifestResult = {
	manifest: NormalisedManifest;
	notes: NormalisationNote[];
};

const CONTAINERS = [
	{ holder: "classes", holds: "methods" },
	{ holder: "contract_templates", holds: "actions" },
] as const;

export function normaliseManifest(raw: Record<string, unknown>): NormaliseManifestResult {
	const notes: NormalisationNote[] = [];

	return {
		manifest: {
			actions: normaliseActions(raw, notes),
			buildMode: readBuildMode(raw, notes),
			chain: asString(raw.chain),
			node: normaliseTopLevel(raw, notes),
			protocol: asString(raw.protocol),
			raw,
			utxoTypes: asRecord(raw.utxo_types) ?? {},
		},
		notes,
	};
}

function normaliseTopLevel(
	raw: Record<string, unknown>,
	notes: NormalisationNote[],
): Record<string, unknown> {
	const node = { ...raw };
	const version = pick(node, "manifest_version", "compose_version", "manifest", notes);

	delete node.compose_version;

	if (version !== undefined) {
		node.manifest_version = version;
	}

	return node;
}

function readBuildMode(raw: Record<string, unknown>, notes: NormalisationNote[]): BuildMode {
	const flat = raw.compile_debug_symbols;
	const nested = asRecord(raw.simplicity_hl)?.debug_symbols;

	for (const [declared, at] of [
		[flat, "compile_debug_symbols"],
		[nested, "simplicity_hl.debug_symbols"],
	] as const) {
		if (declared !== undefined && typeof declared !== "boolean") {
			return {
				ok: false,
				reason:
					`This protocol declares ${at} as ${JSON.stringify(declared)}, which is neither on ` +
					"nor off. The wallet builds each contract the way its protocol states, and cannot " +
					"follow a statement it cannot read.",
			};
		}
	}

	if (flat !== undefined && nested !== undefined && flat !== nested) {
		return {
			ok: false,
			reason:
				"This protocol declares compile_debug_symbols and simplicity_hl.debug_symbols as " +
				"opposite modes. The two build different contracts at different addresses, and the " +
				"format does not say which spelling wins.",
		};
	}

	if (flat === undefined && nested !== undefined) {
		notes.push({
			at: "manifest",
			canonical: "compile_debug_symbols",
			found: "simplicity_hl.debug_symbols",
		});
	}

	return { includeDebugSymbols: (flat ?? nested) === true, ok: true };
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
	if (action.boundTo === undefined) {
		return {};
	}

	for (const container of CONTAINERS) {
		const fields = asRecord(
			asRecord(asRecord(manifest.raw[container.holder])?.[action.boundTo])?.fields,
		);

		if (fields) {
			return fields;
		}
	}

	return {};
}

export type NormalisedInstance = {
	className?: string;
	fields: Record<string, unknown>;
};

export type NormaliseInstanceResult = {
	instance: NormalisedInstance;
	notes: NormalisationNote[];
};

export function normaliseInstance(
	raw: Record<string, unknown> | undefined,
): NormaliseInstanceResult {
	const notes: NormalisationNote[] = [];

	if (!raw) {
		return { instance: { fields: {} }, notes };
	}

	const nested = asRecord(raw.instance);
	const fields = asRecord(nested?.fields);
	const legacy = asRecord(raw.instance_params);

	if (!fields && legacy) {
		notes.push({ at: "instance", canonical: "instance.fields", found: "instance_params" });
	}

	return {
		instance: {
			...(asString(nested?.class) === undefined ? {} : { className: asString(nested?.class) }),
			fields: fields ?? legacy ?? {},
		},
		notes,
	};
}

function normaliseActions(
	raw: Record<string, unknown>,
	notes: NormalisationNote[],
): NormalisedAction[] {
	const actions: NormalisedAction[] = [];
	const seen = new Set<string>();

	for (const [name, declared] of Object.entries(asRecord(raw.actions) ?? {})) {
		const node = asRecord(declared);

		if (!node) {
			continue;
		}

		seen.add(name);
		actions.push(normaliseAction(name, node, undefined, notes));
	}

	for (const container of CONTAINERS) {
		for (const [owner, declared] of Object.entries(asRecord(raw[container.holder]) ?? {})) {
			const held = asRecord(asRecord(declared)?.[container.holds]);

			if (held && container.holder !== "classes") {
				notes.push({ at: `container ${owner}`, canonical: "classes", found: container.holder });
			}

			for (const [name, method] of Object.entries(held ?? {})) {
				const node = asRecord(method);

				if (!node || seen.has(name)) {
					continue;
				}

				seen.add(name);
				actions.push(normaliseAction(name, node, owner, notes));
			}
		}
	}

	return actions;
}

function normaliseAction(
	name: string,
	declared: Record<string, unknown>,
	boundTo: string | undefined,
	notes: NormalisationNote[],
): NormalisedAction {
	const node = { ...declared };
	const isConstructor = pick(node, "is_constructor", "deploy", `action ${name}`, notes);

	delete node.deploy;

	if (isConstructor !== undefined) {
		node.is_constructor = Boolean(isConstructor);
	}

	return {
		...(boundTo === undefined ? {} : { boundTo }),
		isConstructor: Boolean(isConstructor),
		name,
		node,
	};
}

function pick(
	node: Record<string, unknown>,
	canonical: string,
	legacy: string,
	at: string,
	notes: NormalisationNote[],
): unknown {
	if (canonical in node) {
		return node[canonical];
	}

	if (!(legacy in node)) {
		return undefined;
	}

	notes.push({ at, canonical, found: legacy });

	return node[legacy];
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
