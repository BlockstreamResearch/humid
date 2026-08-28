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
	/**
	 * The kind of position it sits at, as the table itself keys them.
	 *
	 * Reported because `at` is written for a person — "action Pay / param amount_sat" — and a
	 * caller that needs to know two reports concern the same construct has otherwise to parse
	 * that sentence, which makes a display string into a contract nobody declared. The same key
	 * at two kinds of position is two constructs and may be in two different states.
	 */
	site: ConstructSiteKind;
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
			reports.push({ at, key, site: kind, state: stateOf(site, key) });
		}
	});

	return reports;
}

/** One construct the runtime registers, for a caller holding no document. */
export type ConstructRegistryEntry = {
	key: string;
	/** Why the runtime does not act on it, or undefined where it does. */
	reason: string | undefined;
	/** The kind of position, or undefined where the key is answered at every position. */
	site: ConstructSiteKind | undefined;
	state: ConstructState;
};

/**
 * Every construct this runtime knows, whether or not anyone has pasted a document.
 *
 * The companion to {@link describeConstructs} from the other side. That one answers "what is
 * in this document"; this one answers "what can this runtime honour at all", which no document
 * can answer, because a construct nobody has published is invisible in every document there
 * is. All seven that the format defines and this runtime does not implement are in exactly
 * that position today: no published protocol uses one, so every document ever inspected here
 * has read clean while the seven stood.
 *
 * Unsorted. A caller ordering it knows what its reader came for; the table's own order is the
 * order somebody typed it in.
 */
export function describeRegistry(): ConstructRegistryEntry[] {
	const entries: ConstructRegistryEntry[] = [];

	for (const [kind, site] of Object.entries(SITES) as [ConstructSiteKind, ConstructSite][]) {
		for (const [key, construct] of Object.entries(site.constructs)) {
			entries.push(entryOf(key, kind, construct));
		}
	}

	for (const [key, construct] of Object.entries(DOCUMENT_CONVENTIONS)) {
		entries.push(entryOf(key, undefined, construct));
	}

	return entries;
}

function entryOf(
	key: string,
	site: ConstructSiteKind | undefined,
	construct: Construct,
): ConstructRegistryEntry {
	if (construct.handled) {
		return { key, reason: undefined, site, state: construct.loadBearing ? "acted-on" : "shown" };
	}

	return {
		key,
		reason: construct.reason,
		site,
		state: construct.loadBearing ? "unimplemented" : "never-read",
	};
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
type Construct =
	| {
			/** The runtime acts on it today. */
			handled: true;
			/** Whether reading it wrong could change what gets signed. */
			loadBearing: boolean;
	  }
	| {
			/** The runtime does not act on it, so it becomes a finding. */
			handled: false;
			loadBearing: boolean;
			/**
			 * Why this runtime does not act on it, for a reader who is not looking at this file.
			 *
			 * Required rather than optional, which is the whole of what makes it worth having: a
			 * construct added here without one does not compile, so the gap cannot be widened in
			 * silence. Where nobody ever wrote the reason down, the honest text says exactly that —
			 * an unexplained gap is a fact about this project and reads as one.
			 */
			reason: string;
	  };

const READ: Construct = { handled: true, loadBearing: true };
const SHOWN: Construct = { handled: true, loadBearing: false };

/** The format defines it, this runtime does not implement it, and being wrong changes money. */
function unimplemented(reason: string): Construct {
	return { handled: false, loadBearing: true, reason };
}

/** Known, deliberately read by nothing, and unable to change what gets signed. */
function unread(reason: string): Construct {
	return { handled: false, loadBearing: false, reason };
}

/**
 * The keys that belong to JSON documents rather than to this format.
 *
 * A comment and a pointer to a schema file can appear at any depth, decide nothing anywhere,
 * and are put there by whatever wrote or edits the document. Listing them at every position
 * would be nine copies of the same statement and would still be wrong at the tenth position
 * someone uses one at, so they are answered once here.
 */
const DOCUMENT_CONVENTIONS: Record<string, Construct> = {
	$comment: unread(
		"A comment, put there by whatever wrote or edits the document. It can appear at any depth and decides nothing anywhere.",
	),
	// The same statement `$schema` makes, spelled by a document whose own tooling validates
	// against `$schema` and which wanted the pointer kept without being validated on. Named
	// here rather than matched by prefix: this is one more key that is known, and a rule
	// accepting anything opening with `$comment` would accept a key nobody has read.
	$comment_schema: unread(
		"A pointer to a schema file, written as a comment so a validator leaves it alone. It decides nothing, exactly as $schema decides nothing.",
	),
	$schema: unread(
		"A pointer to a schema file, put there by whatever wrote or edits the document. It can appear at any depth and decides nothing anywhere.",
	),
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
			args: unimplemented(
				"Nothing in this runtime reads it, and no note here says why. The gap is real and unexplained.",
			),
			create_instance: READ,
			description: SHOWN,
			inputs: READ,
			intent: unread(
				"A sentence saying what this action does, written for whoever approves it, beside the shorter description. Not shown: its text interpolates values from the deployment and the request through a syntax no specification describes, and a confident sentence about the wrong amounts changes what a person agrees to.",
			),
			is_constructor: unread(
				"The older generation's flag beside the create_instance block. The newer one dropped it, on the ground that an action carrying the block is the constructor and a flag adds nothing. Six of the corpus's eleven constructors carry both and five carry only the block, so what it asserts is asserted better by the block beside it.",
			),
			on_input_resolved: unimplemented(
				"A hook the legacy hooks block held, alongside on_validate, before both moved onto the action. Nothing in this runtime runs it, and no note here says why.",
			),
			on_post_broadcast: unimplemented(
				"The counterpart of on_pre_broadcast, which this runtime does run. Nothing here runs this one, and no note says why.",
			),
			on_pre_broadcast: READ,
			on_validate: unimplemented(
				"A full SimplicityHL program rather than a formula: honouring it means executing a contract at build time. Out of scope when the runtime was built, and named here rather than left absent.",
			),
			outputs: READ,
			params: READ,
			ui: SHOWN,
			validations: READ,
			witnesses: unimplemented(
				"An action-level witness block. Witnesses on an input are read, and what is and is not honoured inside one is settled at the witness position; nothing reads this outer block, and no note here says why.",
			),
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
			// Read for the one kind the wallet can carry out. A reissuance and a minted
			// reissuance token are refused by name where the block is resolved, because both
			// depend on what the request carries rather than on what the document says.
			issuance: READ,
			on_resolved: READ,
			// The action tolerates this input's absence. The wallet includes what it is given
			// and never drops one, which is inside what the declaration permits.
			optional: SHOWN,
			// Read, and checked against where the wallet will actually put this input. Being
			// stricter than the reference implementation here is the maintainer's decision of
			// 2026-08-14: a covenant reads positions, so a mismatch is rejected by the network
			// after signing, and refusing before it is strictly better.
			required_index: READ,
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
			attestation_version: unread(
				"Reserved for a signature slot that does not exist, and read by no implementation including the reference one.",
			),
			actions: READ,
			chain: READ,
			classes: READ,
			compile_debug_symbols: READ,
			// The document's own default for whether an output hides what it carries. No published
			// manifest states one, so it is read for the case none of them is.
			confidential_outputs: READ,
			// The container of a contract's actions, under the name the corpus uses now. Its
			// previous name is `classes` above; the normaliser reads both and neither is
			// preferred, because several generations of the same protocol coexist.
			contract_templates: READ,
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
			source: unread(
				'One line in the published specification — "relative path to the top-level .simf file" — and nothing anywhere says what a runtime does with it. The newer schema dropped it from the top level entirely, the reference implementation reads no such field, and no published manifest carries one: a covenant\'s source is named on the covenant, where it decides an address. Refusing a document for carrying it would be refusing for a field the format has abandoned.',
			),
			utxo_types: READ,
		},
		unknownIsLoadBearing: true,
	},
	output: {
		constructs: {
			amount_sat: READ,
			asset: READ,
			condition: unimplemented(
				"A condition deciding whether this output is produced at all. Nothing in this runtime evaluates it, and no note here says why.",
			),
			// Whether this output hides what it carries. The wallet hides it with its own
			// blinding key; one paid to an address the document names refuses, because the key
			// there belongs to whoever owns the address.
			confidential: READ,
			data: READ,
			description: SHOWN,
			destination: READ,
			id: READ,
			optional: SHOWN,
			required_index: READ,
			ui: SHOWN,
		},
		unknownIsLoadBearing: true,
	},
	param: {
		constructs: {
			// How a parameter is filled without asking anyone. An expression is evaluated and a
			// value the wallet itself holds refuses by name, because a review that opens no
			// signing key cannot produce one.
			compute: READ,
			// The literal used when nothing supplied a value, which is the last of the three
			// steps and never overwrites one a person chose.
			default: READ,
			derived: unimplemented(
				"A parameter derived from something else rather than supplied or computed. Nothing in this runtime derives it, and no note here says why.",
			),
			description: SHOWN,
			formula: unread(
				"The reference implementation's own comment calls it informational only, for display, so it does not decide a value and cannot change what is signed.",
			),
			// The oldest generation's spelling of a value the wallet supplies. Read together
			// with the newer one, so a refusal names the thing rather than the spelling.
			source: READ,
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
			// The type and the literal of a value the document states outright. They are read
			// together and never apart: a value with no type is a witness nothing can
			// type-check, and a type with no value names nothing to check.
			simplicity_type: READ,
			source: READ,
			type: READ,
			value: READ,
		},
		unknownIsLoadBearing: true,
	},
} satisfies Record<string, ConstructSite>;

/**
 * Every kind of position this format has, as the construct table itself keys them.
 *
 * Published because a caller reporting on a document needs to say which kind a construct was
 * found at without reading the sentence written for a person, and because the set is the
 * table's own rather than a second list that could fall behind it.
 */
export type ConstructSiteKind = keyof typeof SITES;

type SiteKind = ConstructSiteKind;

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
