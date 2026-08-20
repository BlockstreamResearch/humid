import { asRecord } from "../document/json";
import { declaresLeafKind, encodeLeafPayload, type LeafPartResolver } from "./leafParts";
import { encodeMetadataParts, type PartResolver } from "./metadataParts";

export type EncodedBytes = { hex: string; ok: true } | { ok: false; reason: string };

/**
 * The format's two byte-encoding vocabularies, kept apart.
 *
 * A covenant's address is derived from the exact bytes of its extra taproot leaves, so an
 * encoding read wrong does not produce an error — it produces a well-formed address for a
 * contract nobody deployed, and the wallet then refuses a legitimate action for a reason
 * nothing on screen explains. Every encoding is therefore declared and refused when it is
 * not recognised, and nothing is inferred from the shape of a value.
 *
 * The two vocabularies are genuinely different and are implemented separately rather than
 * unified. `extra_leaves` has seven types, one endianness rule and a padding rule; an output's
 * object-form `data` has six types, a different endianness default and no padding at all.
 * Folding them together would carry a default across that is the reverse of the one measured
 * on the other side, which is the shape of a mistake that changes bytes without changing
 * anything visible.
 *
 * This file keeps `extra_leaves`. The object-form vocabulary lives in `metadataParts.ts`,
 * where each of its entries records what was measured; `encodeDataParts` below is the name the
 * rest of the runtime already calls it by.
 */

/** The integer widths `extra_leaves` accepts, in bytes. */
const LEAF_WIDTHS: Record<string, number> = { u16: 2, u32: 4, u64: 8, u8: 1 };

/** The byte types `extra_leaves` accepts, with the exact length each requires. */
const LEAF_BYTE_LENGTHS: Record<string, number | undefined> = {
	bytes: undefined,
	bytes32: 32,
	pubkey: 32,
};

/**
 * Encodes one item of a utxo type's `extra_leaves`.
 *
 * Four shapes: a hex literal, a typed value, a reference to one of the utxo type's own state
 * variables — which resolves to that variable's default as a single byte — and a kind of leaf
 * with a list of parts, which `leafParts.ts` reads and which encodes each of its parts back
 * through here.
 *
 * **Order of operations, stated because it decides addresses.** The value is encoded to its
 * type's natural width, then the endianness is applied, then padding extends it. Padding
 * before reversing would turn a right-aligned pad into a left-aligned one, so the order is
 * not arbitrary; it is also not something any document states, and is recorded as an
 * uncertainty rather than presented as established.
 *
 * `resolve` is what lets a value inside a payload name something rather than be something. It
 * is used at that position and nowhere else: a leaf written as a bare typed value encodes
 * exactly the bytes it did before, whether a resolver is supplied or not.
 */
export function encodeLeafItem(
	item: unknown,
	stateVars: Record<string, unknown> = {},
	resolve?: LeafPartResolver,
): EncodedBytes {
	if (typeof item === "string") {
		return fromHex(item);
	}

	const record = asRecord(item);

	if (!record) {
		return {
			ok: false,
			reason: "An extra leaf is not a hex literal, a typed value or a state variable.",
		};
	}

	if (typeof record.state_var === "string") {
		return fromStateVar(record.state_var, stateVars);
	}

	const type = record.type;

	if (typeof type !== "string") {
		return { ok: false, reason: "An extra leaf declares no type, and none is inferred." };
	}

	if (declaresLeafKind(type, record)) {
		return encodeLeafPayload(
			type,
			record,
			(part) => encodeLeafItem(part, stateVars, resolve),
			resolve,
		);
	}

	if (!("value" in record)) {
		return { ok: false, reason: `The ${type} extra leaf carries no value.` };
	}

	const encoded = encodeTyped(type, record.value);

	if (!encoded.ok) {
		return encoded;
	}

	const ordered = record.endian === "be" ? reverse(encoded.hex) : encoded.hex;

	return pad(ordered, record.pad_to, record.align);
}

/**
 * Encodes an output's object-form `data`.
 *
 * The vocabulary itself is in `metadataParts.ts`. This is the name the runtime already reaches
 * for, kept so that a caller asking for an output's bytes does not have to know which of the
 * format's two vocabularies answered.
 */
export function encodeDataParts(data: unknown, resolve?: PartResolver): EncodedBytes {
	return encodeMetadataParts(data, resolve);
}

function encodeTyped(type: string, value: unknown): EncodedBytes {
	const width = LEAF_WIDTHS[type];

	if (width !== undefined) {
		return fromInteger(type, value, width);
	}

	if (!(type in LEAF_BYTE_LENGTHS)) {
		return {
			ok: false,
			reason: `An extra leaf is declared ${type}, which is not an encoding this runtime has.`,
		};
	}

	const encoded = fromHex(value);

	if (!encoded.ok) {
		return encoded;
	}

	const required = LEAF_BYTE_LENGTHS[type];

	if (required !== undefined && encoded.hex.length !== required * 2) {
		return {
			ok: false,
			reason: `A ${type} value is ${encoded.hex.length / 2} bytes, and ${type} is ${required}.`,
		};
	}

	return encoded;
}

/** Little-endian, which is this vocabulary's default; `endian: "be"` reverses it after. */
function fromInteger(type: string, value: unknown, width: number): EncodedBytes {
	const count = asCount(value);

	if (count === undefined) {
		return { ok: false, reason: `A ${type} value is not a whole number.` };
	}

	if (count < 0n) {
		return { ok: false, reason: `A ${type} value is negative, and these encodings are unsigned.` };
	}

	if (count >= 2n ** BigInt(width * 8)) {
		return { ok: false, reason: `A value of ${count} does not fit in a ${type}.` };
	}

	const big = count.toString(16).padStart(width * 2, "0");

	return { hex: reverse(big), ok: true };
}

function fromStateVar(name: string, stateVars: Record<string, unknown>): EncodedBytes {
	const declared = asRecord(stateVars[name]);

	if (!declared) {
		return {
			ok: false,
			reason: `An extra leaf names the state variable ${name}, which is not declared.`,
		};
	}

	return fromInteger("u8", declared.default_value, 1);
}

function fromHex(value: unknown): EncodedBytes {
	if (typeof value !== "string") {
		return { ok: false, reason: "A byte value is not hex." };
	}

	const digits = value.startsWith("0x") ? value.slice(2) : value;

	if (digits.length % 2 !== 0) {
		return { ok: false, reason: `"${value}" is not a whole number of bytes.` };
	}

	if (digits.length > 0 && !/^[0-9a-fA-F]+$/.test(digits)) {
		return { ok: false, reason: `"${value}" is not hex.` };
	}

	return { hex: digits.toLowerCase(), ok: true };
}

/** `pad_to` extends; it never truncates, because a truncated value is a different value. */
function pad(hex: string, target: unknown, align: unknown): EncodedBytes {
	if (target === undefined) {
		return { hex, ok: true };
	}

	const length = asCount(target);

	if (length === undefined || length < 0n) {
		return { ok: false, reason: "An extra leaf declares a pad_to that is not a length." };
	}

	const have = BigInt(hex.length / 2);

	if (have > length) {
		return {
			ok: false,
			reason: `An extra leaf is ${have} bytes, longer than the ${length} it pads to.`,
		};
	}

	const zeros = "00".repeat(Number(length - have));

	return { hex: align === "left" ? hex + zeros : zeros + hex, ok: true };
}

function reverse(hex: string): string {
	return (hex.match(/../g) ?? []).toReversed().join("");
}

function asCount(value: unknown): bigint | undefined {
	if (typeof value === "bigint") {
		return value;
	}

	if (typeof value === "number") {
		return Number.isSafeInteger(value) ? BigInt(value) : undefined;
	}

	return typeof value === "string" && /^-?\d+$/.test(value) ? BigInt(value) : undefined;
}
