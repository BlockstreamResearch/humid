import { asRecord } from "../document/json";
import { parseReference } from "../document/references";
import type { EncodedBytes } from "./encode";

/**
 * An extra taproot leaf written as a kind and a list of parts.
 *
 * `extra_leaves` has a second shape beside the three `encode.ts` already reads. A leaf can be
 * written `{"type": "tapdata", "payload": [ … ]}`, where the parts are the leaf's bytes and the
 * type names the kind of leaf rather than the type of a value.
 *
 * **What a `tapdata` leaf is.** The compiler takes a JSON array of hex strings, one per leaf,
 * and puts each one in a storage slot (`smplx/crates/wasm/src/lib.rs` L185-196). A slot becomes
 * a hidden taproot node whose hash is `tap_data_hash(slot)` — `sha256(tag ‖ tag ‖ slot)` with
 * `tag = sha256("TapData")` (`smplx/crates/sdk/src/utils.rs` L44-53), added to the tree at
 * `crates/sdk/src/program/core.rs` L395-405. So the leaf's payload is one run of bytes hashed
 * as one run, and `tapdata` is the only kind of extra leaf this compiler can build. Any other
 * kind is refused by name rather than built as if it were this one: an extra leaf is part of
 * the tree the address is derived from, and a leaf of the wrong kind derives a different
 * address without failing anywhere.
 *
 * **Why the parts concatenate, and what is not established about that.** The bytes are one run,
 * and the contract that reads these leaves composes its own copy through a streaming SHA-256
 * context — `jet::tapdata_init()`, then a `sha_256_ctx_8_add_32` per value, then finalize. A
 * sequence of adds into one context is a concatenation, in the order they are made. That is the
 * reading. What no source settles is the multi-part case itself: every payload any published
 * document writes holds exactly one part, so concatenation of several is reasoned from the
 * streaming model rather than measured against a document. It is recorded here as that rather
 * than presented as established.
 *
 * **A part is a leaf item.** The parts use the vocabulary `extra_leaves` already has — a hex
 * literal, or a typed value with `endian`, `pad_to` and `align` — so nothing new is invented for
 * them and `encode.ts` encodes each one. What is added at this position is that a part's value
 * may name something instead of being something, which is the only reason this file needs a
 * resolver.
 *
 * **No byte order is carried across.** This file chooses no endianness. A part states its own,
 * and the vocabulary's own defaults are `encode.ts`'s and stay there. The sibling vocabulary on
 * an output's `data` reached the opposite integer default; nothing from it is read here.
 */

/**
 * How a part's value is resolved when it names something rather than being something.
 *
 * Supplied by the caller for the same reason `metadataParts` takes one: what a name may refer to
 * is decided by the position the name sits at, and this encoder does not know its own position.
 */
export type LeafPartResolver = (
	reference: string,
) => { ok: true; value: unknown } | { ok: false; reason: string };

/** The kinds of extra leaf this runtime can build, which is the set the compiler can build. */
const LEAF_KINDS = new Set(["tapdata"]);

/**
 * Whether a leaf record declares a kind of leaf rather than a type of value.
 *
 * A record carrying a payload is one whatever its type says, so an unrecognised kind is refused
 * as a kind — which names what is wrong — instead of falling through to the value vocabulary and
 * being refused for carrying no value, which names something else.
 */
export function declaresLeafKind(type: string, leaf: Record<string, unknown>): boolean {
	return LEAF_KINDS.has(type) || "payload" in leaf;
}

/**
 * Encodes one extra leaf written as a kind and a payload.
 *
 * `encodeItem` is the leaf-item encoder, applied to each part after any name in it is resolved.
 * Every refusal names the part it is about, because its position in the payload is the only name
 * a part has — the format gives them no ids — and a person holding a request needs to know which
 * of the values the wallet could not write.
 */
export function encodeLeafPayload(
	kind: string,
	leaf: Record<string, unknown>,
	encodeItem: (item: unknown) => EncodedBytes,
	resolve?: LeafPartResolver,
): EncodedBytes {
	if (!LEAF_KINDS.has(kind)) {
		return {
			ok: false,
			reason: `An extra leaf is declared ${kind}, which is not a kind of leaf this runtime can build.`,
		};
	}

	if (!("payload" in leaf)) {
		return { ok: false, reason: `The ${kind} extra leaf carries no payload.` };
	}

	if (!Array.isArray(leaf.payload)) {
		return {
			ok: false,
			reason: `The ${kind} extra leaf carries a payload that is not a list of parts.`,
		};
	}

	// An empty payload is a leaf declared and left unsaid. It would hash to a real leaf and
	// derive a real address, so it is refused rather than encoded as no bytes.
	if (leaf.payload.length === 0) {
		return { ok: false, reason: `The ${kind} extra leaf carries an empty payload.` };
	}

	let hex = "";
	let position = 0;

	for (const entry of leaf.payload) {
		position += 1;

		const part = substitute(entry, position, resolve);

		if (!part.ok) {
			return part;
		}

		const encoded = encodeItem(part.item);

		if (!encoded.ok) {
			return { ok: false, reason: `payload part ${position}: ${encoded.reason}` };
		}

		hex += encoded.hex;
	}

	return { hex, ok: true };
}

/**
 * One part with whatever it names looked up, ready for the leaf-item encoder.
 *
 * The rule for telling a name from a value is the format's own reference grammar and nothing
 * else — the same parser every other reference position in this runtime asks. It can read a
 * literal as a name: a thirty-two-byte value written without `0x` and opening with a letter is a
 * perfect reference. That direction costs a refusal naming the text, which a person can act on
 * and which `0x` in front of it settles for good. The other direction would cost bytes nobody
 * checks, in a leaf the address is derived from.
 */
function substitute(
	entry: unknown,
	position: number,
	resolve: LeafPartResolver | undefined,
): { item: unknown; ok: true } | { ok: false; reason: string } {
	const record = asRecord(entry);

	if (record && "payload" in record) {
		return {
			ok: false,
			reason: `payload part ${position} carries a payload of its own, and a part is a value rather than a leaf.`,
		};
	}

	const written = record ? record.value : entry;
	const named =
		typeof written === "string" && parseReference(written) !== undefined ? written : undefined;

	if (named === undefined) {
		return { item: entry, ok: true };
	}

	if (!resolve) {
		return {
			ok: false,
			reason: `payload part ${position} names "${named}", and this encoding was asked for with nothing to resolve a name against.`,
		};
	}

	const resolved = resolve(named);

	if (!resolved.ok) {
		return {
			ok: false,
			reason: `payload part ${position} is wired to "${named}", which did not resolve: ${resolved.reason}`,
		};
	}

	return { item: record ? { ...record, value: resolved.value } : resolved.value, ok: true };
}
