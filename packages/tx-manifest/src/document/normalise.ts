import { asRecord } from "./json";

/**
 * One spelling the runtime accepted and rewrote, and where it did so.
 *
 * Kept rather than discarded because a document that needed rewriting is a document from an
 * older generation of the format, and that is worth being able to say out loud — both to the
 * person approving an action and to whoever reads a refusal later.
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
 * `boundTo` is the whole of the difference between the two declaration shapes: a method belongs
 * to a class and therefore to a deployment, and reads that deployment's field values; a free
 * action belongs to nothing and reads no instance file. Everything else about the two is the
 * same, which is why they normalise to one type rather than two.
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
	/**
	 * The mode this protocol states its contracts were built in, under either spelling.
	 *
	 * A result rather than a boolean, because a document can state it in a way that cannot be
	 * followed and the alternative to saying so is picking one. See `readBuildMode`.
	 */
	buildMode: BuildMode;
	chain?: string;
	protocol?: string;
	/** The document exactly as it arrived, so nothing this layer does not model is lost. */
	raw: Record<string, unknown>;
	utxoTypes: Record<string, unknown>;
};

/**
 * Whether this protocol's contracts are built with debug symbols — or why that cannot be said.
 *
 * Not a detail of the build. The flag changes the commitment merkle root and therefore both the
 * covenant address and every covenant script hash a document computes, so a contract built in the
 * wrong mode lands somewhere else entirely. The wallet follows the mode the protocol states and
 * builds plainly when it states nothing.
 *
 * That is not a hole in the address check: whatever a site declares, the wallet rebuilds the
 * contract and refuses unless the result matches where the funds actually sit, so a misdeclared
 * mode produces a refusal rather than an exploit. It decides what the wallet computes, never what
 * it compares against — which is why no user-facing setting governs it and none exists.
 */
export type BuildMode = { includeDebugSymbols: boolean; ok: true } | { ok: false; reason: string };

export type NormaliseManifestResult = {
	manifest: NormalisedManifest;
	notes: NormalisationNote[];
};

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

/**
 * Rewrites a manifest's known spellings into one canonical vocabulary.
 *
 * The format has changed faster than its own specification, so a real document may be written
 * in any of several generations and there is no field that reliably says which. So this selects
 * by observation — it looks for each legacy spelling where that spelling can appear — rather
 * than by branching on a declared generation.
 *
 * **Every rename is positional.** `compile_params` is both a deprecated reference namespace and
 * the name of the wiring map on a script, an input and an output; renaming by key alone would
 * rewrite the wiring and change what gets compiled. So this rewrites keys only at the paths
 * where the legacy meaning applies, and the namespace — which is a spelling inside a reference
 * string rather than a key — is canonicalised where references are resolved instead.
 *
 * Nothing here refuses. A construct this slice does not model survives untouched into `raw`.
 */
export function normaliseManifest(raw: Record<string, unknown>): NormaliseManifestResult {
	const notes: NormalisationNote[] = [];

	return {
		manifest: {
			actions: normaliseActions(raw, notes),
			buildMode: readBuildMode(raw, notes),
			chain: asString(raw.chain),
			protocol: asString(raw.protocol),
			raw,
			utxoTypes: asRecord(raw.utxo_types) ?? {},
		},
		notes,
	};
}

/**
 * The build mode moved into a block of its own, and the wallet reads it where it was.
 *
 * `compile_debug_symbols` at the top level became `simplicity_hl.debug_symbols`. A document
 * carrying only the older spelling keeps it, and the rewrite is recorded rather than applied
 * silently.
 *
 * **Two things refuse rather than resolve.** A statement that is neither on nor off cannot be
 * followed — there is no third mode to build in, and picking one would be this wallet deciding
 * what the protocol meant. Two statements that disagree are the same problem written twice: the
 * document says both modes, the two produce different addresses, and nothing in the format says
 * which spelling wins. Guessing either way silently derives the wrong contract.
 */
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

/** The action of that name, whichever shape declared it. */
export function findAction(
	manifest: NormalisedManifest,
	name: string,
): NormalisedAction | undefined {
	return manifest.actions.find((action) => action.name === name);
}

/**
 * What a deployment of this action's contract declares about its own fields.
 *
 * A deployment's fields are declared once on the container and filled in per deployment, so the
 * container is where a field's type is stated — there is nowhere else. They are read through the
 * same container list the actions were found through rather than through a name of their own,
 * because the rename that hid every one of these documents renamed both halves at once.
 *
 * Empty for a free action, which belongs to no container and therefore to no deployment.
 */
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
 * `instance_params` map beside it. A file carrying both is not a conflict to resolve by merging
 * — the nested form is the one a current tool writes, so it wins outright and the legacy map is
 * ignored rather than layered underneath.
 *
 * **Only those two shapes.** A file matching neither has no fields, and reading its top level as
 * the fields themselves would turn `{"instance": {"class": "X"}}` into a deployment holding one
 * field named `instance` whose value is an object. That resolves, encodes as nothing, and refuses
 * somewhere further on for a reason about the wrong thing. A deployment nobody wrote fields into
 * is empty, and every name read against it says so.
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
			...(asString(nested?.class) === undefined ? {} : { className: asString(nested?.class) }),
			fields: fields ?? legacy ?? {},
		},
		notes,
	};
}

/**
 * Every declaration shape, in declaration order: flat `actions` first, then each container's.
 *
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

/**
 * The value under the current name, or under the legacy one — recording which was found so a
 * rewrite is never silent.
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
