import { asRecord } from "../document/json";
import { type Action, type Manifest } from "../document/manifest";

export function declaredParamTypes(manifest: Manifest, action: Action): Record<string, string> {
	return {
		...typesOf(manifest.templateFields(action)),
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
