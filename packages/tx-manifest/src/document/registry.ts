import { asArray, asRecord } from "./json";
import type { Manifest } from "./manifest";

export type ConstructState = "acted-on" | "shown" | "unimplemented";

type Construct = { state: ConstructState };

const READ: Construct = { state: "acted-on" };
const SHOWN: Construct = { state: "shown" };
const UNIMPLEMENTED: Construct = { state: "unimplemented" };

const SITES = {
	action: {
		allow_change: READ,
		create_instance: READ,
		description: SHOWN,
		inputs: READ,
		intent: SHOWN,
		on_post_broadcast: UNIMPLEMENTED,
		on_pre_broadcast: READ,
		outputs: READ,
		params: READ,
	},
	programReference: {
		args: UNIMPLEMENTED,
		compile_params: READ,
		if: UNIMPLEMENTED,
		script_hash: READ,
		type: READ,
		utxo_type: READ,
	},
	compute: {
		address: UNIMPLEMENTED,
		compile_params: UNIMPLEMENTED,
		depends_on: UNIMPLEMENTED,
		expr: UNIMPLEMENTED,
		extra_leaves: READ,
		fn: UNIMPLEMENTED,
		input: UNIMPLEMENTED,
		params: READ,
		program: UNIMPLEMENTED,
		simf: READ,
		simf_hash: READ,
		simplicity_hl_version: READ,
		type: READ,
		wallet: READ,
	},
	createInstance: {
		fields: READ,
	},
	input: {
		amount_sat: READ,
		asset: READ,
		blinding: READ,
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
	manifest: {
		actions: READ,
		chain: READ,
		contract_templates: READ,
		description: SHOWN,
		manifest_version: READ,
		programs: UNIMPLEMENTED,
		protocol: SHOWN,
		requires: READ,
		simplicity_hl: READ,
		utxo_types: READ,
	},
	output: {
		amount_sat: READ,
		asset: READ,
		blinding: READ,
		condition: UNIMPLEMENTED,
		confidential: READ,
		data: READ,
		description: SHOWN,
		destination: READ,
		id: READ,
		optional: SHOWN,
		required_index: READ,
		ui: SHOWN,
	},
	param: {
		compute: READ,
		default: READ,
		description: SHOWN,
		type: READ,
	},
	script: {
		compile_params: READ,
		extra_leaves: READ,
		program: UNIMPLEMENTED,
		simplicity_hl_version: READ,
		source: READ,
		source_hash: READ,
		type: READ,
	},
	simplicityHl: {
		debug_symbols: READ,
		unstable_features: READ,
		version: READ,
	},
	template: {
		actions: READ,
		description: SHOWN,
		fields: READ,
	},
	ui: {
		group: SHOWN,
		hide: SHOWN,
		label: SHOWN,
		role: SHOWN,
	},
	utxoType: {
		asset: SHOWN,
		description: SHOWN,
		params: UNIMPLEMENTED,
		script: READ,
		state_vars: UNIMPLEMENTED,
	},
	witness: {
		description: SHOWN,
		sig_type: READ,
		source: READ,
		type: READ,
		value: READ,
	},
} satisfies Record<string, Record<string, Construct>>;

export type ConstructSiteKind = keyof typeof SITES;

const IGNORED = new Set(["$comment", "$schema"]);

export type ConstructRegistryEntry = {
	key: string;
	site: ConstructSiteKind;
	state: ConstructState;
};

export function describeRegistry(): ConstructRegistryEntry[] {
	return Object.entries(SITES).flatMap(([site, constructs]) =>
		Object.entries(constructs).map(([key, construct]: [string, Construct]) => ({
			key,
			site: site as ConstructSiteKind,
			state: construct.state,
		})),
	);
}

export type ConstructFinding = {
	at: string;
	key: string;
	state: "unimplemented" | "unrecognised";
};

export function inspectConstructs(manifest: Manifest): ConstructFinding[] {
	const findings: ConstructFinding[] = [];

	walkSites(manifest, (node, site, at) => {
		const constructs: Record<string, Construct> = SITES[site];

		for (const key of Object.keys(node)) {
			const construct = constructs[key];

			if (IGNORED.has(key) || (!construct && site === "ui")) {
				continue;
			}

			if (!construct) {
				findings.push({ at, key, state: "unrecognised" });
			} else if (construct.state === "unimplemented") {
				findings.push({ at, key, state: "unimplemented" });
			}
		}
	});

	return findings;
}

type SiteVisitor = (node: Record<string, unknown>, site: ConstructSiteKind, at: string) => void;

function walkSites(manifest: Manifest, visit: SiteVisitor): void {
	const at = (where: string, node: unknown, site: ConstructSiteKind) => {
		const record = asRecord(node);

		if (record) {
			visit(record, site, where);
		}
	};

	at("manifest", manifest.node, "manifest");
	at("simplicity_hl", manifest.node.simplicity_hl, "simplicityHl");

	for (const [name, template] of Object.entries(asRecord(manifest.node.contract_templates) ?? {})) {
		at(`template ${name}`, template, "template");
	}

	for (const action of manifest.actions) {
		const where = `action ${action.name}`;

		at(where, action.node, "action");
		at(`${where} / create_instance`, action.node.create_instance, "createInstance");

		for (const [name, field] of Object.entries(
			asRecord(asRecord(action.node.create_instance)?.fields) ?? {},
		)) {
			at(`${where} / create_instance / ${name}`, field, "compute");
		}

		for (const [name, param] of Object.entries(asRecord(action.node.params) ?? {})) {
			at(`${where} / param ${name}`, param, "param");
			at(`${where} / param ${name} / compute`, asRecord(param)?.compute, "compute");
		}

		for (const kind of ["input", "output"] as const) {
			for (const declared of asArray(action.node[`${kind}s`])) {
				const entry = asRecord(declared);
				const entryAt = `${where} / ${kind} ${typeof entry?.id === "string" ? entry.id : "(unnamed)"}`;

				at(entryAt, entry, kind);
				at(entryAt, entry?.ui, "ui");
				at(
					`${entryAt} / ${kind === "input" ? "utxo_source" : "destination"}`,
					entry?.[kind === "input" ? "utxo_source" : "destination"],
					"programReference",
				);

				for (const [name, witness] of Object.entries(asRecord(entry?.witnesses) ?? {})) {
					at(`${entryAt} / witness ${name}`, witness, "witness");
				}
			}
		}
	}

	for (const [name, declared] of Object.entries(manifest.utxoTypes)) {
		at(`utxo type ${name}`, declared, "utxoType");
		at(`utxo type ${name} / script`, asRecord(declared)?.script, "script");
	}
}
