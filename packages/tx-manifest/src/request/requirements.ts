import { asRecord } from "../document/json";
import type { NormalisedAction, NormalisedManifest } from "../document/normalise";
import { instanceReferences } from "../document/references";
import { covenantSites, namedUtxoTypes } from "../document/sites";
import type { ActionRequirements, MissingPart, ParsedLiquidProcessCtParams } from "./request";

export function resolveActionRequirements(
	request: ParsedLiquidProcessCtParams,
	manifest: NormalisedManifest,
	declared: NormalisedAction,
): ActionRequirements {
	const action = declared.node;
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

	const reads = instanceReferences(manifest, declared, request.params);

	if (reads.length > 0) {
		if (declared.boundTo === undefined) {
			missing.push({
				part: "instance",
				keys: reads.map((occurrence) => occurrence.at),
				reason:
					`The action "${declared.name}" reads a deployment's field values and is declared ` +
					"outside any class, so there is no deployment for it to read.",
			});
		} else {
			required.push("instance");

			if (!request.instance) {
				missing.push({
					keys: reads.map((occurrence) => occurrence.at),
					part: "instance",
					reason:
						`The action "${declared.name}" is a method of ${declared.boundTo} and reads the ` +
						"field values of one deployment of it.",
				});
			}
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

function referencedContractSources(
	manifest: NormalisedManifest,
	action: Record<string, unknown>,
): string[] {
	const utxoTypes = manifest.utxoTypes;
	const paths = new Set<string>();

	for (const name of namedUtxoTypes(action)) {
		const source = asRecord(asRecord(utxoTypes[name])?.script)?.source;

		if (typeof source === "string") {
			paths.add(source);
		}
	}

	return [...paths];
}

function spendsCovenant(action: Record<string, unknown>): boolean {
	return covenantSites(action).some((site) => site.role === "spent");
}

function promptedParams(action: Record<string, unknown>): string[] {
	const params = asRecord(action.params) ?? {};

	return Object.entries(params)
		.filter(([, declared]) => {
			const record = asRecord(declared);

			return !record || !("source" in record || "compute" in record || "derived" in record);
		})
		.map(([name]) => name);
}
