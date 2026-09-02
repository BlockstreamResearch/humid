import { asRecord } from "../document/json";

/**
 * The declared types a covenant's compile parameters are encoded against.
 *
 * Read from the action's own parameter declarations rather than inferred from the values the
 * request filled them with. A value's shape is not evidence of what it was declared as, and a
 * runtime that guessed from it would read a covenant hash of sixty-four zeros as a number.
 *
 * A declaration this cannot read leaves the name with no type, which refuses. That is the
 * direction to fail in: the alternative is a value encoded at a width nobody stated, and the
 * width is part of the address.
 */
export function declaredParamTypes(action: Record<string, unknown>): Record<string, string> {
	const types: Record<string, string> = {};

	for (const [name, declared] of Object.entries(asRecord(action.params) ?? {})) {
		const type = asRecord(declared)?.type;

		if (typeof type === "string") {
			types[name] = type;
		}
	}

	return types;
}
