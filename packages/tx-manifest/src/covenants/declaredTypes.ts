import { asRecord } from "../document/json";
import {
	declaredFields,
	type NormalisedAction,
	type NormalisedManifest,
} from "../document/normalise";

export function declaredParamTypes(
	manifest: NormalisedManifest,
	action: NormalisedAction,
): Record<string, string> {
	return {
		...typesOf(declaredFields(manifest, action)),
		...typesOf(asRecord(action.node.params) ?? {}),
	};
}

function typesOf(declared: Record<string, unknown>): Record<string, string> {
	const types: Record<string, string> = {};

	for (const [name, entry] of Object.entries(declared)) {
		const type = asRecord(entry)?.type;

		if (typeof type === "string") {
			types[name] = type;
		}
	}

	return types;
}
