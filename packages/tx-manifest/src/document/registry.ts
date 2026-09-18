import { asArray, asRecord } from "./json";
import type { NormalisedManifest } from "./normalise";

export type ConstructFinding = {
	at: string;
	declared: boolean;
	key: string;
	loadBearing: boolean;
};

export function ignored(findings: ConstructFinding[]): ConstructFinding[] {
	return findings.filter((finding) => !finding.loadBearing);
}

export function loadBearing(findings: ConstructFinding[]): ConstructFinding[] {
	return findings.filter((finding) => finding.loadBearing);
}

export type ConstructState = "acted-on" | "shown" | "unimplemented" | "never-read" | "unrecognised";

export type ConstructReport = {
	at: string;
	key: string;
	site: ConstructSiteKind;
	state: ConstructState;
};

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

export type ConstructRegistryEntry = {
	key: string;
	reason: string | undefined;
	site: ConstructSiteKind | undefined;
	state: ConstructState;
};

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

type Construct =
	| {
			handled: true;
			loadBearing: boolean;
	  }
	| {
			handled: false;
			loadBearing: boolean;
			reason: string;
	  };

const READ: Construct = { handled: true, loadBearing: true };
const SHOWN: Construct = { handled: true, loadBearing: false };

function unimplemented(reason: string): Construct {
	return { handled: false, loadBearing: true, reason };
}

function unread(reason: string): Construct {
	return { handled: false, loadBearing: false, reason };
}

const DOCUMENT_CONVENTIONS: Record<string, Construct> = {
	$comment: unread(
		"A comment, put there by whatever wrote or edits the document. It can appear at any depth and decides nothing anywhere.",
	),
	$comment_schema: unread(
		"A pointer to a schema file, written as a comment so a validator leaves it alone. It decides nothing, exactly as $schema decides nothing.",
	),
	$schema: unread(
		"A pointer to a schema file, put there by whatever wrote or edits the document. It can appear at any depth and decides nothing anywhere.",
	),
};

type ConstructSite = {
	constructs: Record<string, Construct>;
	unknownIsLoadBearing: boolean;
};

const SITES = {
	action: {
		constructs: {
			args: unimplemented(
				"Arguments supplied beside the action's parameters. Nothing in this runtime reads them, and a name resolving to nothing where one was supplied builds a different transaction.",
			),
			create_instance: READ,
			description: SHOWN,
			inputs: READ,
			intent: unread(
				"A sentence saying what this action does, written for whoever approves it, beside the shorter description. Not shown: its text interpolates values through a syntax no specification describes, and a confident sentence about the wrong amounts changes what a person agrees to.",
			),
			is_constructor: READ,
			on_input_resolved: unimplemented(
				"A hook the legacy hooks block held, alongside on_validate, before both moved onto the action. Nothing in this runtime runs it, and no note here says why.",
			),
			on_post_broadcast: unimplemented(
				"The counterpart of on_pre_broadcast, which this runtime does run. Nothing here runs this one, and no note says why.",
			),
			on_pre_broadcast: READ,
			on_validate: unimplemented(
				"A full SimplicityHL program rather than a formula: honouring it means executing a contract at build time. Out of scope for this runtime, and named here rather than left absent.",
			),
			outputs: READ,
			params: READ,
			ui: SHOWN,
			validations: READ,
			witnesses: unimplemented(
				"An action-level witness block. Witnesses on an input are read, and what is and is not honoured inside one is settled at the witness position; nothing reads this outer block.",
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
			issuance: READ,
			on_resolved: READ,
			optional: SHOWN,
			required_index: READ,
			sequence: READ,
			ui: SHOWN,
			utxo_source: READ,
			witnesses: READ,
		},
		unknownIsLoadBearing: true,
	},
	manifest: {
		constructs: {
			actions: READ,
			attestation_version: unread(
				"Reserved for a signature slot that does not exist, and read by no implementation including the reference one.",
			),
			chain: READ,
			classes: READ,
			compile_debug_symbols: READ,
			confidential_outputs: READ,
			contract_templates: READ,
			description: SHOWN,
			errors: SHOWN,
			lifecycle: SHOWN,
			manifest_version: READ,
			params: unimplemented(
				"Compile parameters declared for the protocol rather than for one action. Nothing here reads them, and a covenant compiled without one derives a different address for the same contract.",
			),
			protocol: SHOWN,
			simplicity_hl: READ,
			simplicity_hl_version: READ,
			source: unread(
				'One line in the published specification — "relative path to the top-level .simf file" — and nothing anywhere says what a runtime does with it. The newer schema dropped it, the reference implementation reads no such field, and no published manifest carries one: a covenant\'s source is named on the covenant, where it decides an address.',
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
				"A condition deciding whether this output is produced at all. Nothing in this runtime evaluates it, so an output the document meant to omit would be built.",
			),
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
			compute: READ,
			default: READ,
			derived: unimplemented(
				"A parameter derived from something else rather than supplied or computed. Nothing in this runtime derives it, so its value would be whatever else happened to fill the name.",
			),
			description: SHOWN,
			formula: unread(
				"The reference implementation's own comment calls it informational only, for display, so it does not decide a value and cannot change what is signed.",
			),
			source: READ,
			type: READ,
		},
		unknownIsLoadBearing: true,
	},
	script: {
		constructs: {
			compile_params: READ,
			// A contract's state, which its address commits to: each leaf is a hidden tapleaf beside
			// the program, so the value decides where the funds are rather than merely describing
			// them. Read, and every leaf encoded to the thirty-two bytes a contract reads one at.
			extra_leaves: READ,
			source: READ,
			type: READ,
		},
		unknownIsLoadBearing: true,
	},
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
			state_vars: unread(
				"The names a deployment of this contract fills in. What a covenant is compiled from is its wiring, which is read at the script position; this declaration states the shape of a deployment file the wallet is handed rather than deciding any value in it.",
			),
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
	witness: {
		constructs: {
			description: SHOWN,
			sig_type: READ,
			simplicity_type: READ,
			source: READ,
			type: READ,
			value: READ,
		},
		unknownIsLoadBearing: true,
	},
} satisfies Record<string, ConstructSite>;

export type ConstructSiteKind = keyof typeof SITES;

type SiteKind = ConstructSiteKind;

function constructAt(site: ConstructSite, key: string): Construct | undefined {
	return site.constructs[key] ?? DOCUMENT_CONVENTIONS[key];
}

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

type SiteVisitor = (node: Record<string, unknown>, kind: SiteKind, at: string) => void;

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
