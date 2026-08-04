import { asArray, asRecord } from "./json";

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
 * unified. `extra_leaves` has seven types, an endianness and a padding rule; an output's
 * object-form `data` has three types and neither. Folding them together would silently
 * accept `endian` in a position where the format has no such key, which is the shape of a
 * mistake that changes bytes without changing anything visible.
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
 * Three shapes: a hex literal, a typed value, and a reference to one of the utxo type's own
 * state variables — which resolves to that variable's default as a single byte.
 *
 * **Order of operations, stated because it decides addresses.** The value is encoded to its
 * type's natural width, then the endianness is applied, then padding extends it. Padding
 * before reversing would turn a right-aligned pad into a left-aligned one, so the order is
 * not arbitrary; it is also not something any document states, and is recorded as an
 * uncertainty rather than presented as established.
 */
export function encodeLeafItem(
	item: unknown,
	stateVars: Record<string, unknown> = {},
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
 * `{parts: [{type, value}, …]}`, concatenated in order. Only `bytes`, `u8` and `u64`, and
 * no endianness or padding to choose — so a document carrying one of those keys here is
 * refused rather than quietly encoded as if it had said nothing.
 */
export function encodeDataParts(
	data: unknown,
	resolve: (reference: string) => { ok: true; value: unknown } | { ok: false; reason: string } = (
		reference,
	) => ({ ok: true, value: reference }),
): EncodedBytes {
	const declared = asRecord(data)?.parts;

	if (!Array.isArray(declared)) {
		return { ok: false, reason: "Object-form data carries no parts list." };
	}

	let hex = "";

	for (const entry of asArray(declared)) {
		const part = asRecord(entry);

		if (!part) {
			return { ok: false, reason: "A data part is not a typed value." };
		}

		for (const key of ["endian", "pad_to", "align"]) {
			if (key in part) {
				return {
					ok: false,
					reason: `A data part carries ${key}, which this vocabulary does not have.`,
				};
			}
		}

		const type = part.type;

		if (typeof type !== "string" || !(type === "bytes" || type === "u8" || type === "u64")) {
			return {
				ok: false,
				reason: `A data part is declared ${String(type)}, which object-form data does not have.`,
			};
		}

		// A part's value can be a reference — every one in the corpus is — so it is resolved
		// before it is encoded. Encoding the reference text itself would produce bytes that
		// look like a payload and are the name of one.
		const resolved =
			typeof part.value === "string" && !part.value.startsWith("0x")
				? resolve(part.value)
				: { ok: true as const, value: part.value };

		if (!resolved.ok) {
			return { ok: false, reason: `A data part could not be resolved: ${resolved.reason}` };
		}

		// Big-endian, because there is no key to say otherwise and a length-prefixed binary
		// layout written by hand reads in that order.
		const encoded = encodeTyped(type, resolved.value);

		if (!encoded.ok) {
			return encoded;
		}

		hex += type === "u64" ? reverse(encoded.hex) : encoded.hex;
	}

	return { hex, ok: true };
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
	return (hex.match(/../g) ?? []).reverse().join("");
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
