import { asRecord } from "../document/json";
import { findAction, type NormalisedAction, type NormalisedManifest } from "../document/normalise";
import { instanceReferences } from "../document/references";
import { covenantSites, namedUtxoTypes } from "../document/sites";
import type { ActionRequirements, MissingPart, ParsedLiquidProcessCtParams } from "./request";

/**
 * Works out what the chosen action actually needs from the request, and what of that is
 * absent — so a request can be refused before anything is built, naming what was missing.
 *
 * It answers the question by reading the action, not by checking the request's shape: a
 * manifest with no covenant parameters needs no instance file, and an action that creates
 * rather than spends reads nothing from state. Requiring all six parts of every request
 * would refuse valid ones; requiring none would fail later and less legibly.
 *
 * Every question it asks now goes through the runtime core — the action comes from the
 * normalised document, the covenant sites from one enumeration, and whether the instance
 * file is read from the reference sites rather than from a search for reference-shaped
 * text anywhere in the action.
 */
export function resolveActionRequirements(
	request: ParsedLiquidProcessCtParams,
	manifest: NormalisedManifest,
): ActionRequirements {
	const action = findAction(manifest, request.action);

	if (!action) {
		return {
			missing: [
				{
					part: "params",
					reason: `The manifest declares no action named "${request.action}".`,
				},
			],
			required: [],
		};
	}

	const required: ActionRequirements["required"] = [];
	const missing: MissingPart[] = [];

	const sources = referencedContractSources(manifest, action);

	if (sources.length > 0) {
		required.push("contractSources");

		const absent = sources.filter((path) => !(path in request.contractSources));

		if (absent.length > 0) {
			missing.push({
				keys: absent,
				part: "contractSources",
				reason: "The action builds contracts whose source was not supplied.",
			});
		}
	}

	const params = promptedParams(action.node);
	const unfilled = params.filter((name) => !(name in request.params));

	if (params.length > 0) {
		required.push("params");
	}

	if (unfilled.length > 0) {
		missing.push({
			keys: unfilled,
			part: "params",
			reason: "The action declares parameters the request did not fill.",
		});
	}

	// A field the action works out for itself is not one the request can be short of. Every
	// constructor in the corpus reads back what its own `create_instance` just computed, and
	// asking the site for that file asks it to send values the document derives — a site that
	// sent its own copy would never find out the two disagreed.
	const created = createdFields(action);
	const readsDeployment = instanceReferences(manifest, action).filter(
		(occurrence) => !created.has(fieldName(occurrence.text)),
	);

	if (readsDeployment.length > 0) {
		required.push("instance");

		// A deployment's field values belong to a class, so an action declared outside one
		// has none to read. No instance file the request could send would satisfy it, which
		// makes this a fault in the document rather than a part the request left out — and
		// saying so beats asking for a file that cannot help.
		if (!action.boundTo) {
			missing.push({
				keys: readsDeployment.map((occurrence) => occurrence.at),
				part: "instance",
				reason:
					`"${request.action}" is not declared inside a class, so it has no deployment, ` +
					"yet it reads one's field values.",
			});
		} else if (!request.instance) {
			missing.push({
				keys: [...new Set(readsDeployment.map((occurrence) => fieldName(occurrence.text)))],
				part: "instance",
				reason: "The action reads this deployment's field values.",
			});
		}
	}

	if (spendsCovenant(action)) {
		required.push("state");

		if (!request.state) {
			missing.push({
				part: "state",
				reason: "The action spends a covenant UTXO, which is located through the state file.",
			});
		}
	}

	return { missing, required };
}

/** Contract source paths the action reaches, through the utxo types it names. */
function referencedContractSources(
	manifest: NormalisedManifest,
	action: Parameters<typeof namedUtxoTypes>[0],
): string[] {
	const paths = new Set<string>();

	for (const name of namedUtxoTypes(action)) {
		const source = asRecord(asRecord(manifest.utxoTypes[name])?.script)?.source;

		if (typeof source === "string") {
			paths.add(source);
		}
	}

	return [...paths];
}

/**
 * Parameter names the request has to fill.
 *
 * A parameter the wallet or the protocol supplies is not prompted for: `source` names
 * where the value comes from, and `compute` and `derived` say it is worked out rather than
 * entered. `formula` is **not** one of these — the reference implementation's own comment
 * calls it informational only for display and never evaluates it, so a parameter carrying
 * one is still a parameter the request must fill. Treating it as derived accepts a request
 * that is short a value and fails later, further from the cause.
 */
function promptedParams(action: Record<string, unknown>): string[] {
	const params = asRecord(action.params) ?? {};

	return Object.entries(params)
		.filter(([, declared]) => {
			const record = asRecord(declared);

			return !record || !("source" in record || "compute" in record || "derived" in record);
		})
		.map(([name]) => name);
}

/** The deployment fields this action brings into existence, which it may then read. */
function createdFields(action: NormalisedAction): Set<string> {
	return new Set(Object.keys(asRecord(asRecord(action.node.create_instance)?.fields) ?? {}));
}

/** The field one `instance.NAME` reference names. */
function fieldName(text: string): string {
	return text.slice(text.indexOf(".") + 1);
}

/** Whether the action spends a covenant UTXO, which is a lookup into the state file. */
function spendsCovenant(action: Parameters<typeof covenantSites>[0]): boolean {
	return covenantSites(action).some((site) => site.role === "spent");
}
