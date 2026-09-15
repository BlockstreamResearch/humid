import { asRecord } from "../document/json";
import {
	declaredFields,
	type NormalisedAction,
	type NormalisedManifest,
} from "../document/normalise";

/**
 * The declared types a covenant's compile parameters are encoded against.
 *
 * Two positions state them and the corpus uses both. An action declares the parameters a request
 * supplies — a constructor says `ASSET_B` is an asset id — and the contract's own class declares
 * the fields a deployment of it holds, which is where the same protocol's later methods state
 * the same thing. They are not two generations: one document writes both, for the two halves of
 * the same protocol, because a value supplied when an offer is made is a value read back when it
 * is filled.
 *
 * Reading only the first is why every covenant a live deployment names went unencodable while
 * the constructor beside it compiled. It also cannot be fixed by reading only the second: a
 * constructor has no deployment to read yet.
 *
 * **The action wins where both declare a name.** A value comes from the request before it comes
 * from the deployment, so the type has to be read in that order or a request would be encoded
 * against a declaration it did not come from.
 */
export function declaredParamTypes(
	manifest: NormalisedManifest,
	action: NormalisedAction,
): Record<string, string> {
	return {
		...typesOf(declaredFields(manifest, action)),
		...typesOf(asRecord(action.node.params) ?? {}),
	};
}

/**
 * The types one map of declarations states.
 *
 * Read rather than inferred, always. A value's own shape is not evidence of what it was declared
 * as, and a runtime that guessed from it would read a covenant hash of sixty-four zeros as a
 * number.
 *
 * A declaration this cannot read leaves the name with no type, which refuses. That is the
 * direction to fail in: the alternative is a value encoded at a width nobody stated, and the
 * width is part of the address.
 */
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
