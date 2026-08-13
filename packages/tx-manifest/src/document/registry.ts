import { asArray, asRecord } from "./json";
import type { NormalisedManifest } from "./normalise";

/**
 * One construct the runtime met and did not act on.
 *
 * The two flags answer different questions. `declared` says whether the format is known to
 * carry this construct at all — the difference between "this wallet does not implement
 * validations yet" and "nobody has ever seen this field". `loadBearing` says whether being
 * wrong about it can change what gets signed, which is what decides between ignoring it
 * and refusing.
 */
export type ConstructFinding = {
	/** Where it was found, in the document's own terms. */
	at: string;
	/** Whether the format is known to carry this construct. */
	declared: boolean;
	key: string;
	/** Whether reading it wrong could change what gets signed. */
	loadBearing: boolean;
};

/** What was ignored, and can be reported as ignored. */
export function ignored(findings: ConstructFinding[]): ConstructFinding[] {
	return findings.filter((finding) => !finding.loadBearing);
}

/** What a refusal has to be built on. */
export function loadBearing(findings: ConstructFinding[]): ConstructFinding[] {
	return findings.filter((finding) => finding.loadBearing);
}

/**
 * What the runtime does with one construct, as a name rather than as two flags.
 *
 * The flags are the right shape for deciding — `loadBearing` is the whole of what a refusal
 * turns on — and the wrong shape for showing, because the four combinations are four
 * different sentences and none of them is "true" or "false". `unrecognised` is the fifth
 * outcome and not one of the four: it is the state of a key no site lists, which the flags
 * carry as `declared: false` rather than as a combination of their own.
 */
export type ConstructState =
	/** Read, and what it says changes what gets signed. */
	| "acted-on"
	/** Read, and shown to a person; it decides nothing. */
	| "shown"
	/** The format defines it and this runtime does not implement it. */
	| "unimplemented"
	/** Known, and deliberately read by nothing, here or in the reference implementation. */
	| "never-read"
	/** No site lists it, so no specification this runtime knows describes it here. */
	| "unrecognised";

/** One construct the document declares, and what this runtime makes of it. */
export type ConstructReport = {
	/** Where it was found, in the document's own terms. */
	at: string;
	key: string;
	state: ConstructState;
};

/**
 * Every construct the document declares, each against what the runtime does with it.
 *
 * The companion to {@link inspectConstructs} rather than a replacement: that one answers
 * "what must this refuse on", which is why it returns only what is unhandled, and this one
 * answers "what is in this document", which needs the handled ones too. Both walk the same
 * table, so neither can drift from the other.
 */
export function describeConstructs(manifest: NormalisedManifest): ConstructReport[] {
	const reports: ConstructReport[] = [];

	walkSites(manifest, (node, kind, at) => {
		const site: ConstructSite = SITES[kind];

		for (const key of Object.keys(node)) {
			reports.push({ at, key, state: stateOf(site, key) });
		}
	});

	return reports;
}

function stateOf(site: ConstructSite, key: string): ConstructState {
	const construct = constructAt(site, key);

	if (!construct) {
		return "unrecognised";
	}

	if (construct.handled) {
		return construct.loadBearing ? "acted-on" : "shown";
	}

	return construct.loadBearing ? "unimplemented" : "never-read";
}

/**
 * How the runtime treats one construct at one kind of site.
 *
 * `handled` is a claim about this codebase rather than about the format, and it is the
 * reason the table is worth having: a construct nobody implements is invisible in code and
 * visible here, so the gap between what the format can say and what the wallet can honour
 * is a table to read rather than an absence to notice.
 */
type Construct = {
	/** Whether the runtime acts on it today. An unhandled one becomes a finding. */
	handled: boolean;
	/** Whether reading it wrong could change what gets signed. */
	loadBearing: boolean;
};

const READ: Construct = { handled: true, loadBearing: true };
const SHOWN: Construct = { handled: true, loadBearing: false };
const UNIMPLEMENTED: Construct = { handled: false, loadBearing: true };
const UNREAD: Construct = { handled: false, loadBearing: false };

/**
 * The two keys that belong to JSON documents rather than to this format.
 *
 * A comment and a pointer to a schema file can appear at any depth, decide nothing anywhere,
 * and are put there by whatever wrote or edits the document. Listing them at every position
 * would be nine copies of the same statement and would still be wrong at the tenth position
 * someone uses one at, so they are answered once here.
 */
const DOCUMENT_CONVENTIONS: Record<string, Construct> = {
	$comment: UNREAD,
	$schema: UNREAD,
};

/** What a position says about one key, or what every position says about it. */
function constructAt(site: ConstructSite, key: string): Construct | undefined {
	return site.constructs[key] ?? DOCUMENT_CONVENTIONS[key];
}

/**
 * One kind of position in a manifest, and what it may contain.
 *
 * `unknownIsLoadBearing` is the site's own answer for a key nobody has listed. It is true
 * almost everywhere, because an unlisted field in a position that describes what is spent
 * or created is exactly the case cornerstone 4 exists for. It is false only where the
 * whole position is text for a person — and that is what makes an unrecognised *decorative*
 * construct a thing that can exist rather than a category with no members.
 */
type ConstructSite = {
	constructs: Record<string, Construct>;
	unknownIsLoadBearing: boolean;
};

/**
 * The construct table, keyed by site kind and then by the key's own name.
 *
 * Adding a construct to the runtime is an edit here plus the code that reads it. That is
 * the whole point of the table: the alternative is a condition somewhere in a function
 * that already does something else, which is how a manifest interpreter turns into a
 * switch statement nobody can audit.
 *
 * Sourced from the cross-source inventory in the change bundle, which reconciles the
 * cookbook, the published specification, the ELIP draft, the seven example manifests and
 * the reference implementation.
 */
const SITES = {
	action: {
		constructs: {
			args: UNIMPLEMENTED,
			create_instance: READ,
			description: SHOWN,
			inputs: READ,
			// A sentence saying what this action does, written for whoever approves it, beside the
			// shorter `description`. It decides nothing that gets signed. Not shown: its text
			// interpolates values from the deployment and the request through a syntax no
			// specification describes, and a confident sentence about the wrong amounts changes
			// what a person agrees to.
			intent: UNREAD,
			// The older generation's flag beside the block. The newer one dropped it, on the
			// ground that an action carrying the block is the constructor and a flag adds
			// nothing; six of the corpus's eleven constructors carry both and five carry only
			// the block. So it is read for nothing, which is different from being ignored:
			// what it asserts is asserted better by the block beside it.
			is_constructor: UNREAD,
			on_input_resolved: UNIMPLEMENTED,
			on_post_broadcast: UNIMPLEMENTED,
			on_pre_broadcast: READ,
			// A full SimplicityHL program, not a formula: honouring it means executing a
			// contract at build time. Out of scope for this change and named rather than absent.
			on_validate: UNIMPLEMENTED,
			outputs: READ,
			params: READ,
			ui: SHOWN,
			validations: READ,
			witnesses: UNIMPLEMENTED,
		},
		unknownIsLoadBearing: true,
	},
	input: {
		constructs: {
			amount_sat: READ,
			asset: READ,
			description: SHOWN,
			from_address: READ,
			id: READ,
			issuance: UNIMPLEMENTED,
			on_resolved: READ,
			// The action tolerates this input's absence. The wallet includes what it is given
			// and never drops one, which is inside what the declaration permits.
			optional: SHOWN,
			// Covenants depend on input and output ordering and no implementation enforces
			// this, so a manifest asking for index 0 and getting 1 builds a transaction the
			// covenant rejects on chain.
			required_index: UNIMPLEMENTED,
			sequence: READ,
			ui: SHOWN,
			utxo_source: READ,
			// Read for the one thing the runtime can act on — which witness the signer must
			// fill. The witness site below carries what is and is not honoured inside one.
			witnesses: READ,
		},
		unknownIsLoadBearing: true,
	},
	manifest: {
		constructs: {
			// Reserved for a signature slot that does not exist, and read by no
			// implementation including the reference one.
			attestation_version: UNREAD,
			actions: READ,
			chain: READ,
			classes: READ,
			compile_debug_symbols: READ,
			// The container of a contract's actions, under the name the corpus uses now. Its
			// previous name is `classes` above; the normaliser reads both and neither is
			// preferred, because several generations of the same protocol coexist.
			contract_templates: READ,
			confidential_outputs: UNIMPLEMENTED,
			description: SHOWN,
			errors: SHOWN,
			lifecycle: SHOWN,
			manifest_version: READ,
			params: READ,
			protocol: SHOWN,
			// A block the format grew to hold what used to sit at the top level. Only the build
			// mode is inside it today, lifted by the normaliser to the flat name this runtime
			// already acts on.
			simplicity_hl: READ,
			simplicity_hl_version: READ,
			// One line in the published specification — "relative path to the top-level .simf
			// file" — and nothing anywhere says what a runtime does with it. The newer schema
			// dropped it from the top level entirely, the reference implementation reads no such
			// field, and no published manifest carries one: a covenant's source is named on the
			// covenant, where it decides an address. So it decides nothing here, and refusing a
			// document for carrying it would be refusing for a field the format has abandoned.
			source: UNREAD,
			utxo_types: READ,
		},
		unknownIsLoadBearing: true,
	},
	output: {
		constructs: {
			amount_sat: READ,
			asset: READ,
			condition: UNIMPLEMENTED,
			confidential: UNIMPLEMENTED,
			data: READ,
			description: SHOWN,
			destination: READ,
			id: READ,
			optional: SHOWN,
			required_index: UNIMPLEMENTED,
			ui: SHOWN,
		},
		unknownIsLoadBearing: true,
	},
	param: {
		constructs: {
			compute: UNIMPLEMENTED,
			default: UNIMPLEMENTED,
			derived: UNIMPLEMENTED,
			description: SHOWN,
			// The reference implementation's own comment calls it informational only for
			// display, so it does not decide a value and cannot change what is signed.
			formula: UNREAD,
			source: UNIMPLEMENTED,
			type: READ,
		},
		unknownIsLoadBearing: true,
	},
	script: {
		constructs: {
			compile_params: READ,
			extra_leaves: READ,
			source: READ,
			type: READ,
		},
		unknownIsLoadBearing: true,
	},
	/** Display metadata the protocol author wrote. Nothing here decides a value. */
	ui: {
		constructs: {
			action: SHOWN,
			group: SHOWN,
			hide: SHOWN,
			label: SHOWN,
			role: SHOWN,
		},
		unknownIsLoadBearing: false,
	},
	utxoType: {
		constructs: {
			asset: READ,
			confidential: READ,
			description: SHOWN,
			script: READ,
			state_vars: READ,
		},
		unknownIsLoadBearing: true,
	},
	validation: {
		constructs: {
			description: SHOWN,
			error: SHOWN,
			error_code: SHOWN,
			id: SHOWN,
			rule: READ,
		},
		unknownIsLoadBearing: true,
	},
	/**
	 * A witness the spend has to supply.
	 *
	 * Three keys are read and each is also checked, because reading a key is not the same as
	 * honouring every value it can hold: a witness type, a source or a sighash type this
	 * runtime cannot produce refuses by name rather than being signed as if it had said
	 * something else. Those checks live in the refusal surface, not here.
	 */
	witness: {
		constructs: {
			description: SHOWN,
			sig_type: READ,
			simplicity_type: UNIMPLEMENTED,
			source: READ,
			type: READ,
			value: UNIMPLEMENTED,
		},
		unknownIsLoadBearing: true,
	},
} satisfies Record<string, ConstructSite>;

type SiteKind = keyof typeof SITES;

/**
 * Walks a normalised manifest and reports every construct the runtime does not act on.
 *
 * It runs over the whole document rather than only the action being performed, because
 * the format's own conformance rule is stated about the manifest: a tool that does not
 * implement an extension must reject a manifest using its fields. Each finding names where
 * it is, so a later slice can still choose to refuse on reach rather than on presence
 * without this having thrown the information away.
 */
export function inspectConstructs(manifest: NormalisedManifest): ConstructFinding[] {
	const findings: ConstructFinding[] = [];

	walkSites(manifest, (node, kind, at) => {
		const site: ConstructSite = SITES[kind];

		for (const key of Object.keys(node)) {
			const construct = constructAt(site, key);

			if (construct?.handled) {
				continue;
			}

			findings.push({
				at,
				declared: construct !== undefined,
				key,
				loadBearing: construct ? construct.loadBearing : site.unknownIsLoadBearing,
			});
		}
	});

	return findings;
}

/** One position in the document, and what it declares. */
type SiteVisitor = (node: Record<string, unknown>, kind: SiteKind, at: string) => void;

/**
 * Every position in the document, in one place.
 *
 * Extracted so that refusing and reporting read the same traversal rather than two copies of
 * it: a position added to one and forgotten in the other is a construct that refuses without
 * appearing, or appears without refusing, and neither is discoverable by reading either
 * function alone.
 */
function walkSites(manifest: NormalisedManifest, visit: SiteVisitor): void {
	visitSite(manifest.node, "manifest", "manifest", visit);

	for (const action of manifest.actions) {
		const where = `action ${action.name}`;

		visitSite(action.node, "action", where, visit);
		visitSite(asRecord(action.node.ui), "ui", where, visit);

		for (const [name, declared] of Object.entries(asRecord(action.node.params) ?? {})) {
			visitSite(asRecord(declared), "param", `${where} / param ${name}`, visit);
		}

		visitEntries(asArray(action.node.inputs), "input", where, visit);
		visitEntries(asArray(action.node.outputs), "output", where, visit);

		for (const declared of asArray(action.node.validations)) {
			const rule = asRecord(declared);
			const id = typeof rule?.id === "string" ? rule.id : "(unnamed)";

			visitSite(rule, "validation", `${where} / validation ${id}`, visit);
		}
	}

	for (const [name, declared] of Object.entries(manifest.utxoTypes)) {
		const where = `utxo type ${name}`;
		const utxoType = asRecord(declared);

		visitSite(utxoType, "utxoType", where, visit);
		visitSite(asRecord(utxoType?.script), "script", `${where} / script`, visit);
	}
}

/** Inputs and outputs both carry an id, a display block and per-entry witnesses. */
function visitEntries(
	entries: unknown[],
	kind: "input" | "output",
	where: string,
	visit: SiteVisitor,
): void {
	for (const declared of entries) {
		const entry = asRecord(declared);
		const id = typeof entry?.id === "string" ? entry.id : "(unnamed)";
		const at = `${where} / ${kind} ${id}`;

		visitSite(entry, kind, at, visit);
		visitSite(asRecord(entry?.ui), "ui", at, visit);

		for (const [name, witness] of Object.entries(asRecord(entry?.witnesses) ?? {})) {
			visitSite(asRecord(witness), "witness", `${at} / witness ${name}`, visit);
		}
	}
}

function visitSite(
	node: Record<string, unknown> | undefined,
	kind: SiteKind,
	at: string,
	visit: SiteVisitor,
): void {
	if (!node) {
		return;
	}

	visit(node, kind, at);
}
