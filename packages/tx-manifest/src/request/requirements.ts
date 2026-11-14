import { asRecord } from "../document/json";
import { type Action, type Manifest, readInstance } from "../document/manifest";
import { programUses, namedUtxoTypes } from "../document/programUses";
import { instanceReferences, parseReference } from "../document/references";
import type { MissingPart, ParsedLiquidProcessCtParams } from "./request";

export function missingParts(
	request: ParsedLiquidProcessCtParams,
	manifest: Manifest,
	declared: Action,
): MissingPart[] {
	const action = declared.node;
	const missing: MissingPart[] = [];

	const sources = referencedContractSources(manifest, action);

	const absent = sources.filter((path) => !(path in request.contractSources));

	if (absent.length > 0) {
		missing.push({
			keys: absent,
			part: "contractSources",
			reason: "The action builds contracts whose source was not supplied.",
		});
	}

	const unfilled = promptedParams(action).filter((name) => !(name in request.params));

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
			const unsupplied = reads.filter(
				(occurrence) => !((parseReference(occurrence.text)?.name ?? "") in request.params),
			);

			if (unsupplied.length > 0) {
				missing.push({
					part: "instance",
					keys: unsupplied.map((occurrence) => occurrence.at),
					reason:
						`The action "${declared.name}" reads a deployment's field values and is declared ` +
						"outside any template, so there is no deployment for it to read.",
				});
			}
		} else if (!request.instance) {
			missing.push({
				keys: reads.map((occurrence) => occurrence.at),
				part: "instance",
				reason:
					`The action "${declared.name}" is an action of ${declared.boundTo} and reads the ` +
					"field values of one deployment of that template.",
			});
		}
	}

	const pinned = readInstance(request.instance).providedInputs;

	if (
		!request.state &&
		programUses(action).some((use) => use.role === "spent" && !(use.id in pinned))
	) {
		missing.push({
			part: "state",
			reason:
				"The action spends a program UTXO that the instance file does not pin, so the state file has to locate one.",
		});
	}

	return missing;
}

function referencedContractSources(manifest: Manifest, action: Record<string, unknown>): string[] {
	const paths = new Set<string>();

	for (const name of namedUtxoTypes(action)) {
		const source = asRecord(manifest.utxoType(name)?.script)?.source;

		if (typeof source === "string") {
			paths.add(source);
		}
	}

	return [...paths];
}

function promptedParams(action: Record<string, unknown>): string[] {
	const params = asRecord(action.params) ?? {};

	return Object.entries(params)
		.filter(([, declared]) => {
			const record = asRecord(declared);

			return !record || !("compute" in record);
		})
		.map(([name]) => name);
}
