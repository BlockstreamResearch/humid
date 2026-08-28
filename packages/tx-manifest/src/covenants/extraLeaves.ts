import { asArray } from "../document/json";
import type { NormalisationNote } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import { encodeLeafItem } from "../evaluation/encode";
import type { LeafPartResolver } from "../evaluation/leafParts";

/**
 * The encoded payloads of a covenant's extra taproot leaves, in declaration order.
 *
 * Order is part of the address, so this preserves it rather than collecting into anything that
 * would not. A leaf that cannot be encoded refuses the whole derivation: a covenant missing one
 * of its leaves is a different covenant, and deriving an address for it would produce a
 * well-formed answer to the wrong question.
 *
 * A refusal names the leaf by its position, which is the only name a leaf has — the format gives
 * them no ids — and the caller adds which covenant it belongs to. Together that is enough for a
 * person to find the leaf in the document they were shown.
 *
 * This is also where a name inside a leaf is looked up, because this is the position that says
 * what a name there may mean. A covenant's leaves are part of the address it derives, so they
 * read what a compile parameter reads: this deployment's fields, the request's parameters and
 * arguments, and a bare name.
 *
 * **One reader for two positions.** The corpus declares `extra_leaves` on a utxo type's script
 * and on a `tapleaf` field of the deployment an action creates, and the two are the same
 * construct: in the live lending protocol the second is the script hash of the first, so a byte
 * encoded differently at one of them makes a hash that will never match the covenant it is the
 * hash of. Two implementations of that would be two chances to encode it differently.
 */
export function encodeExtraLeaves(
	declared: unknown,
	reading: {
		notes?: NormalisationNote[];
		scope: ReferenceScope;
		/** The utxo type's own state variables, for a leaf that names one. */
		stateVars?: Record<string, unknown>;
	},
): { hex: string[]; ok: true } | { ok: false; reason: string } {
	const resolve: LeafPartResolver = (reference) => {
		const found = resolveReference(reference, "extraLeaf", reading.scope, reading.notes);

		return found.ok ? { ok: true, value: found.value } : found;
	};

	const hex: string[] = [];
	let position = 0;

	for (const item of asArray(declared)) {
		position += 1;

		const encoded = encodeLeafItem(item, reading.stateVars ?? {}, resolve);

		if (!encoded.ok) {
			return { ok: false, reason: `extra leaf ${position}: ${encoded.reason}` };
		}

		hex.push(encoded.hex);
	}

	return { hex, ok: true };
}
