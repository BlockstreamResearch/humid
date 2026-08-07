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
			create_instance: UNIMPLEMENTED,
			description: SHOWN,
			inputs: READ,
			is_constructor: UNIMPLEMENTED,
			on_input_resolved: UNIMPLEMENTED,
			on_post_broadcast: UNIMPLEMENTED,
			on_pre_broadcast: UNIMPLEMENTED,
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
			on_resolved: UNIMPLEMENTED,
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
			$comment: SHOWN,
			// Reserved for a signature slot that does not exist, and read by no
			// implementation including the reference one.
			attestation_version: UNREAD,
			actions: READ,
			chain: READ,
			classes: READ,
			compile_debug_symbols: READ,
			confidential_outputs: UNIMPLEMENTED,
			description: SHOWN,
			errors: SHOWN,
			lifecycle: SHOWN,
			manifest_version: READ,
			params: READ,
			protocol: SHOWN,
			simplicity_hl_version: READ,
			source: UNIMPLEMENTED,
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

	inspectSite(manifest.node, "manifest", "manifest", findings);

	for (const action of manifest.actions) {
		const where = `action ${action.name}`;

		inspectSite(action.node, "action", where, findings);
		inspectSite(asRecord(action.node.ui), "ui", where, findings);

		for (const [name, declared] of Object.entries(asRecord(action.node.params) ?? {})) {
			inspectSite(asRecord(declared), "param", `${where} / param ${name}`, findings);
		}

		inspectEntries(asArray(action.node.inputs), "input", where, findings);
		inspectEntries(asArray(action.node.outputs), "output", where, findings);

		for (const declared of asArray(action.node.validations)) {
			const rule = asRecord(declared);
			const id = typeof rule?.id === "string" ? rule.id : "(unnamed)";

			inspectSite(rule, "validation", `${where} / validation ${id}`, findings);
		}
	}

	for (const [name, declared] of Object.entries(manifest.utxoTypes)) {
		const where = `utxo type ${name}`;
		const utxoType = asRecord(declared);

		inspectSite(utxoType, "utxoType", where, findings);
		inspectSite(asRecord(utxoType?.script), "script", `${where} / script`, findings);
	}

	return findings;
}

/** Inputs and outputs both carry an id, a display block and per-entry witnesses. */
function inspectEntries(
	entries: unknown[],
	kind: "input" | "output",
	where: string,
	findings: ConstructFinding[],
): void {
	for (const declared of entries) {
		const entry = asRecord(declared);
		const id = typeof entry?.id === "string" ? entry.id : "(unnamed)";
		const at = `${where} / ${kind} ${id}`;

		inspectSite(entry, kind, at, findings);
		inspectSite(asRecord(entry?.ui), "ui", at, findings);

		for (const [name, witness] of Object.entries(asRecord(entry?.witnesses) ?? {})) {
			inspectSite(asRecord(witness), "witness", `${at} / witness ${name}`, findings);
		}
	}
}

function inspectSite(
	node: Record<string, unknown> | undefined,
	kind: SiteKind,
	at: string,
	findings: ConstructFinding[],
): void {
	if (!node) {
		return;
	}

	const site: ConstructSite = SITES[kind];

	for (const key of Object.keys(node)) {
		const construct = site.constructs[key];

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
}
