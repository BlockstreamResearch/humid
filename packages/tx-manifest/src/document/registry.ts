import { asArray, asRecord } from "./json";
import type { NormalisedManifest } from "./normalise";

export type ConstructState = "acted-on" | "shown" | "unimplemented" | "removed";

type Construct = { replacement?: string; state: ConstructState };

const READ: Construct = { state: "acted-on" };
const SHOWN: Construct = { state: "shown" };
const UNIMPLEMENTED: Construct = { state: "unimplemented" };

function removed(replacement?: string): Construct {
	return replacement === undefined ? { state: "removed" } : { replacement, state: "removed" };
}

const SITES = {
	action: {
		allow_change: UNIMPLEMENTED,
		args: removed(),
		create_instance: READ,
		deploy: removed(),
		description: SHOWN,
		hooks: removed("on_resolved on the input"),
		inputs: READ,
		intent: SHOWN,
		is_constructor: removed("create_instance"),
		on_input_resolved: removed("on_resolved on the input"),
		on_post_broadcast: UNIMPLEMENTED,
		on_pre_broadcast: READ,
		outputs: READ,
		params: READ,
		ui: removed("intent"),
		validations: removed(),
		witnesses: removed("witnesses on the input"),
	},
	covenantReference: {
		args: UNIMPLEMENTED,
		compile_params: READ,
		if: UNIMPLEMENTED,
		script_hash: UNIMPLEMENTED,
		type: READ,
		utxo_type: READ,
	},
	createInstance: {
		class: removed(),
		fields: READ,
		template: removed(),
	},
	input: {
		amount_sat: READ,
		asset: READ,
		blinding: UNIMPLEMENTED,
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
		attestation_version: removed(),
		chain: READ,
		classes: removed("contract_templates"),
		compile_debug_symbols: removed("simplicity_hl.debug_symbols"),
		compile_params: removed("fields on the template"),
		confidential_outputs: removed("confidential on the output"),
		contract_templates: READ,
		description: SHOWN,
		errors: removed(),
		lifecycle: removed(),
		manifest_version: READ,
		params: removed("params on the action"),
		programs: UNIMPLEMENTED,
		protocol: SHOWN,
		requires: READ,
		simplicity_hl: READ,
		simplicity_hl_version: removed("simplicity_hl.version"),
		source: removed("source on the script"),
		utxo_types: READ,
	},
	output: {
		amount_sat: READ,
		asset: READ,
		blinding: UNIMPLEMENTED,
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
		derived: removed("compute"),
		description: SHOWN,
		formula: removed("compute"),
		source: removed("compute"),
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
		methods: removed("actions"),
	},
	ui: {
		group: SHOWN,
		hide: SHOWN,
		label: SHOWN,
		role: SHOWN,
	},
	utxoType: {
		asset: SHOWN,
		confidential: removed("confidential on the output"),
		description: SHOWN,
		params: UNIMPLEMENTED,
		script: READ,
		state_vars: UNIMPLEMENTED,
	},
	witness: {
		description: SHOWN,
		inject: UNIMPLEMENTED,
		sig_type: READ,
		simplicity_type: READ,
		source: READ,
		type: READ,
		value: READ,
	},
} satisfies Record<string, Record<string, Construct>>;

export type ConstructSiteKind = keyof typeof SITES;

const IGNORED = new Set(["$comment", "$schema"]);

export type ConstructRegistryEntry = {
	key: string;
	replacement?: string;
	site: ConstructSiteKind;
	state: ConstructState;
};

export function describeRegistry(): ConstructRegistryEntry[] {
	return Object.entries(SITES).flatMap(([site, constructs]) =>
		Object.entries(constructs).map(([key, construct]: [string, Construct]) =>
			Object.assign({ key, site: site as ConstructSiteKind }, construct),
		),
	);
}

export type ConstructFinding = {
	at: string;
	key: string;
	replacement?: string;
	state: "removed" | "unimplemented" | "unrecognised";
};

export function inspectConstructs(manifest: NormalisedManifest): ConstructFinding[] {
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
			} else if (construct.state === "removed" || construct.state === "unimplemented") {
				findings.push({ at, key, ...construct, state: construct.state });
			}
		}
	});

	return findings;
}

type SiteVisitor = (node: Record<string, unknown>, site: ConstructSiteKind, at: string) => void;

function walkSites(manifest: NormalisedManifest, visit: SiteVisitor): void {
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

		for (const [name, param] of Object.entries(asRecord(action.node.params) ?? {})) {
			at(`${where} / param ${name}`, param, "param");
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
					"covenantReference",
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
