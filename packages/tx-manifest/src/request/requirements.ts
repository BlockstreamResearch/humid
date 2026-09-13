import { asRecord } from "../document/json";
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
 * What it does not read, it does not vouch for. The action's declarations are carried
 * through to whatever builds from them rather than checked here: this says a part of the
 * request is present, never that what the document asks for can be honoured.
 */
export function resolveActionRequirements(
	request: ParsedLiquidProcessCtParams,
): ActionRequirements {
	const action = asRecord(asRecord(request.manifest.actions)?.[request.action]);

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

	const sources = referencedContractSources(request.manifest, action);

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

	const params = promptedParams(action);
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
	manifest: Record<string, unknown>,
	action: Record<string, unknown>,
): string[] {
	const utxoTypes = asRecord(manifest.utxo_types) ?? {};
	const paths = new Set<string>();

	for (const name of namedUtxoTypes(action)) {
		const source = asRecord(asRecord(utxoTypes[name])?.script)?.source;

		if (typeof source === "string") {
			paths.add(source);
		}
	}

	return [...paths];
}

/** Whether the action spends a covenant UTXO, which is a lookup into the state file. */
function spendsCovenant(action: Record<string, unknown>): boolean {
	return covenantSites(action).some((site) => site.role === "spent");
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
