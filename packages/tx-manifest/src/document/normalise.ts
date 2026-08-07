import { asRecord, isRecord } from "./json";

/**
 * One spelling the runtime accepted and rewrote, and where it did so.
 *
 * Kept rather than discarded because a document that needed rewriting is a document from
 * an older generation of the format, and that is worth being able to say out loud — both
 * to the person approving an action and to whoever reads a refusal later.
 */
export type NormalisationNote = {
	/** Where the rename happened, in the document's own terms. */
	at: string;
	/** The name the document now carries. */
	canonical: string;
	/** The spelling that was found. */
	found: string;
};

/**
 * One action, however the manifest chose to declare it.
 *
 * `boundTo` is the whole of the difference between the two declaration shapes: a method
 * belongs to a class and therefore to a deployment, and reads that deployment's field
 * values; a free action belongs to nothing and reads no instance file. Everything else
 * about the two is the same, which is why they normalise to one type rather than two.
 */
export type NormalisedAction = {
	/** The class this method belongs to; absent for a free action. */
	boundTo?: string;
	isConstructor: boolean;
	name: string;
	/** The action's own record, with the legacy spellings already rewritten. */
	node: Record<string, unknown>;
};

export type NormalisedManifest = {
	actions: NormalisedAction[];
	chain?: string;
	description?: string;
	manifestVersion?: string;
	/**
	 * The document's top level with its legacy spellings rewritten.
	 *
	 * Anything reading the manifest generically — the construct registry above all — must
	 * read this rather than `raw`, or it sees a rewritten field as an unrecognised one.
	 */
	node: Record<string, unknown>;
	/** Protocol-level compile parameters, flattened out of the legacy nested block. */
	params: Record<string, unknown>;
	protocol?: string;
	/** The document exactly as it arrived, so nothing this layer does not model is lost. */
	raw: Record<string, unknown>;
	utxoTypes: Record<string, unknown>;
};

export type NormaliseManifestResult = {
	manifest: NormalisedManifest;
	notes: NormalisationNote[];
};

/**
 * Rewrites a manifest's known spellings into one canonical vocabulary.
 *
 * The format has changed faster than its own specification, so a real document may be
 * written in any of several generations and there is no field that reliably says which:
 * `manifest_version` tracks the protocol's version, not the format's. So this selects by
 * observation — it looks for each legacy spelling where that spelling can appear — rather
 * than by branching on a declared generation.
 *
 * **Every rename is positional.** `compile_params` is both a deprecated reference
 * namespace and the name of the wiring map on a script, an input and an output; renaming
 * by key alone would rewrite the wiring and change what gets compiled. So this rewrites
 * keys only at the paths where the legacy meaning applies, and the namespace — which is a
 * spelling inside a reference string rather than a key — is canonicalised where references
 * are resolved instead.
 *
 * Nothing here refuses. An unknown construct survives untouched into `raw`; classifying it
 * belongs to the construct registry and refusing on it to a later slice.
 */
export function normaliseManifest(raw: Record<string, unknown>): NormaliseManifestResult {
	const notes: NormalisationNote[] = [];

	const manifestVersion = pick(raw, "manifest_version", "compose_version", "manifest", notes);
	const params = normaliseProtocolParams(raw, notes);
	const actions = normaliseActions(raw, notes);

	const node = { ...raw };

	delete node.compose_version;
	delete node.compile_params;

	liftBuildMode(node, notes);

	if (manifestVersion !== undefined) {
		node.manifest_version = manifestVersion;
	}

	if (Object.keys(params).length > 0 || "params" in raw) {
		node.params = params;
	}

	return {
		manifest: {
			actions,
			chain: asString(raw.chain),
			description: asString(raw.description),
			manifestVersion: asString(manifestVersion),
			node,
			params,
			protocol: asString(raw.protocol),
			raw,
			utxoTypes: asRecord(raw.utxo_types) ?? {},
		},
		notes,
	};
}

/** The action of that name, whichever shape declared it. */
export function findAction(
	manifest: NormalisedManifest,
	name: string,
): NormalisedAction | undefined {
	return manifest.actions.find((action) => action.name === name);
}

/** One deployment's field values, as the runtime reads them. */
export type NormalisedInstance = {
	className?: string;
	fields: Record<string, unknown>;
};

export type NormaliseInstanceResult = {
	instance: NormalisedInstance;
	notes: NormalisationNote[];
};

/**
 * Reads a deployment's field values under either spelling.
 *
 * The current shape nests them under `instance.fields`; the legacy one is a flat
 * `instance_params` map beside it. A file carrying both is not a conflict to resolve by
 * merging — the nested form is the one a current tool writes, so it wins outright and the
 * legacy map is ignored rather than layered underneath.
 */
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
			className: asString(nested?.class),
			fields: fields ?? legacy ?? {},
		},
		notes,
	};
}

/**
 * The build mode moved into a block of its own, and the wallet reads it where it was.
 *
 * `compile_debug_symbols` at the top level became `simplicity_hl.debug_symbols`. It is not
 * cosmetic: the mode changes a contract's commitment root and therefore its address, so a
 * document whose statement goes unread is built the other way and refuses against where the
 * money actually sits. A document carrying the flat name keeps it — the older spelling is not
 * overwritten by a newer copy, which is how every other lift here behaves.
 */
function liftBuildMode(node: Record<string, unknown>, notes: NormalisationNote[]): void {
	const block = asRecord(node.simplicity_hl);

	if (!block || !("debug_symbols" in block) || "compile_debug_symbols" in node) {
		return;
	}

	node.compile_debug_symbols = block.debug_symbols;
	notes.push({
		at: "manifest",
		canonical: "compile_debug_symbols",
		found: "simplicity_hl.debug_symbols",
	});
}

/**
 * Protocol-level compile parameters.
 *
 * The current spelling is a flat `params` map. The legacy one splits the same values into
 * `compile_params.user_provided` and `compile_params.derived`, a distinction about where a
 * value came from rather than about what it is, and nothing downstream reads it — so the
 * two halves flatten into one map.
 */
function normaliseProtocolParams(
	raw: Record<string, unknown>,
	notes: NormalisationNote[],
): Record<string, unknown> {
	const current = asRecord(raw.params);
	const legacy = asRecord(raw.compile_params);

	if (!legacy) {
		return current ?? {};
	}

	notes.push({ at: "manifest", canonical: "params", found: "compile_params" });

	return {
		...asRecord(legacy.derived),
		...asRecord(legacy.user_provided),
		...current,
	};
}

/**
 * Every declaration shape, in declaration order: flat `actions` first, then each container's.
 * A name declared twice resolves to the flat one, which is what every reader of this manifest
 * did before the shapes were unified.
 */
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

/**
 * The names a container of actions has been known by, newest last.
 *
 * One shape under two vocabularies rather than two shapes: a container names a contract, holds
 * the values one deployment of it fills in, and holds the actions performed against it. The
 * corpus renamed both halves at once — `classes.methods` became `contract_templates.actions` —
 * and a document written in either is the same document. Both are read, because a wallet that
 * traded one for the other would be as blind to the previous generation as it was to this one,
 * and the corpus keeps several generations of the same protocol side by side.
 */
const CONTAINERS = [
	{ holder: "classes", holds: "methods" },
	{ holder: "contract_templates", holds: "actions" },
] as const;

function normaliseAction(
	name: string,
	declared: Record<string, unknown>,
	boundTo: string | undefined,
	notes: NormalisationNote[],
): NormalisedAction {
	const node = { ...declared };
	const at = `action ${name}`;

	const isConstructor = pick(node, "is_constructor", "deploy", at, notes);

	delete node.deploy;
	node.is_constructor = isConstructor === undefined ? undefined : Boolean(isConstructor);

	if (node.is_constructor === undefined) {
		delete node.is_constructor;
	}

	liftHooks(node, at, notes);
	node.params = normaliseParamDefinitions(node.params, at, notes);

	if (node.params === undefined) {
		delete node.params;
	}

	return {
		...(boundTo === undefined ? {} : { boundTo }),
		isConstructor: Boolean(isConstructor),
		name,
		node,
	};
}

/**
 * The legacy `hooks` block held `on_input_resolved` and `on_validate`; both later moved to
 * the action itself. Lifting keeps one place to look, and an action already carrying the
 * current spelling keeps it — the newer field is not overwritten by an older copy.
 */
function liftHooks(node: Record<string, unknown>, at: string, notes: NormalisationNote[]): void {
	const hooks = asRecord(node.hooks);

	if (!hooks) {
		return;
	}

	for (const key of ["on_input_resolved", "on_validate"] as const) {
		if (!(key in hooks) || key in node) {
			continue;
		}

		node[key] = hooks[key];
		notes.push({ at, canonical: key, found: `hooks.${key}` });
	}

	delete node.hooks;
}

/** `lang` was the earlier name for a computed parameter's kind; `compute` is current. */
function normaliseParamDefinitions(
	declared: unknown,
	at: string,
	notes: NormalisationNote[],
): Record<string, unknown> | undefined {
	const params = asRecord(declared);

	if (!params) {
		return undefined;
	}

	const normalised: Record<string, unknown> = {};

	for (const [name, definition] of Object.entries(params)) {
		const record = asRecord(definition);

		if (!record || !("lang" in record) || "compute" in record) {
			normalised[name] = definition;

			continue;
		}

		const { lang, ...rest } = record;

		normalised[name] = { ...rest, compute: lang };
		notes.push({ at: `${at} param ${name}`, canonical: "compute", found: "lang" });
	}

	return normalised;
}

/**
 * The value under the current name, or under the legacy one — recording which was found so
 * a rewrite is never silent.
 */
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

/** Re-exported so a caller reading a normalised document needs one import, not two. */
export { asRecord, isRecord };
