import { type Action, type Manifest, namedUtxoTypes, programInputs } from "../document/manifest";
import { instanceReferences, parseReference } from "../values/references";
import type { MissingPart, ParsedLiquidProcessCtParams } from "./request";

export function missingParts(
	request: ParsedLiquidProcessCtParams,
	manifest: Manifest,
	action: Action,
): MissingPart[] {
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

	const reads = instanceReferences(manifest, action, request.params);

	if (reads.length > 0) {
		if (action.template === undefined) {
			const unsupplied = reads.filter(
				(occurrence) => !((parseReference(occurrence.text)?.name ?? "") in request.params),
			);

			if (unsupplied.length > 0) {
				missing.push({
					part: "instance",
					keys: unsupplied.map((occurrence) => occurrence.at),
					reason:
						`The action "${action.name}" reads a deployment's field values and is declared ` +
						"outside any template, so there is no deployment for it to read.",
				});
			}
		} else if (!request.instance) {
			missing.push({
				keys: reads.map((occurrence) => occurrence.at),
				part: "instance",
				reason:
					`The action "${action.name}" is an action of ${action.template} and reads the ` +
					"field values of one deployment of that template.",
			});
		}
	}

	const pinned = request.instance?.provided_inputs ?? {};

	if (!request.state && programInputs(action).some((input) => !(input.label in pinned))) {
		missing.push({
			part: "state",
			reason:
				"The action spends a program UTXO that the instance file does not pin, so the state file has to locate one.",
		});
	}

	return missing;
}

function referencedContractSources(manifest: Manifest, action: Action): string[] {
	return [
		...new Set(
			namedUtxoTypes(action).flatMap((name) => {
				const source = manifest.utxoType(name)?.script.source;

				return source === undefined ? [] : [source];
			}),
		),
	];
}

function promptedParams(action: Action): string[] {
	return Object.entries(action.params)
		.filter(([, declared]) => declared.compute === undefined)
		.map(([name]) => name);
}
