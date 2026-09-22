import { asArray, asRecord } from "../document/json";
import { parseReference } from "../document/references";

export type EncodedBytes = { hex: string; ok: true } | { ok: false; reason: string };

type PartType = {
	/** The exact width a value of this type occupies, for the types that fix one. */
	bytes?: number;
	encoding: "bytes" | "integer" | "reversedBytes";
	shape: string;
};

const PART_TYPES: Record<string, PartType> = {
	bytes: { encoding: "bytes", shape: "bytes, as an even number of hexadecimal characters" },
	"liquid.asset_id": {
		bytes: 32,
		encoding: "reversedBytes",
		shape: "an asset id: 32 bytes as 64 hexadecimal characters",
	},
	u8: { bytes: 1, encoding: "integer", shape: "a whole number that fits in 1 byte" },
	u16: { bytes: 2, encoding: "integer", shape: "a whole number that fits in 2 bytes" },
	u32: { bytes: 4, encoding: "integer", shape: "a whole number that fits in 4 bytes" },
	u64: { bytes: 8, encoding: "integer", shape: "a whole number that fits in 8 bytes" },
};

const BYTE_ORDERS: Record<string, "be" | "le"> = { be: "be", le: "le" };

/** Modifiers of the state-leaf vocabulary that this encoder does not implement. */
const UNSUPPORTED_MODIFIERS = ["align", "pad_to"];

/** Resolves a part value that is a reference; the caller knows what the reference may name. */
export type PartResolver = (
	reference: string,
) => { ok: true; value: unknown } | { ok: false; reason: string };

/**
 * Encodes an output's object-form `data`: `{parts: [{type, value}, …]}`, concatenated in order.
 *
 * The vocabulary is closed. Bytes in the wrong order still make a valid output, and what is lost
 * is only that the protocol's reader can no longer match the record, so a type or modifier that
 * has not been measured against a deployed reader is refused rather than approximated.
 *
 * Integers are little-endian by default because the deployed lending reader decodes them that
 * way. An asset id is reversed because the reader writes it from its internal byte array, which
 * is the reverse of the form documents and requests state it in.
 */
export function encodeMetadataParts(
	data: unknown,
	resolve: PartResolver = (reference) => ({ ok: true, value: reference }),
): EncodedBytes {
	const declared = asRecord(data)?.parts;

	if (!Array.isArray(declared)) {
		return { ok: false, reason: "Object-form data carries no parts list." };
	}

	let hex = "";
	let position = 0;

	for (const entry of asArray(declared)) {
		position += 1;

		const part = asRecord(entry);

		if (!part) {
			return { ok: false, reason: `Data part ${position} is not a typed value.` };
		}

		const encoded = encodePart(part, position, resolve);

		if (!encoded.ok) {
			return encoded;
		}

		hex += encoded.hex;
	}

	return { hex, ok: true };
}

function encodePart(
	part: Record<string, unknown>,
	position: number,
	resolve: PartResolver,
): EncodedBytes {
	for (const key of UNSUPPORTED_MODIFIERS) {
		if (key in part) {
			return {
				ok: false,
				reason: `Data part ${position} carries ${key}, which this runtime does not encode in data parts.`,
			};
		}
	}

	const type = part.type;
	const declared = typeof type === "string" ? PART_TYPES[type] : undefined;

	if (!declared) {
		return {
			ok: false,
			reason: `Data part ${position} is declared ${String(type)}, which object-form data does not have.`,
		};
	}

	if (!("value" in part)) {
		return { ok: false, reason: `Data part ${position}, declared ${type}, carries no value.` };
	}

	const order = byteOrder(part, position, declared);

	if (!order.ok) {
		return order;
	}

	// The format's reference grammar decides: a value it parses as a name is looked up, anything
	// else is a literal. A literal that also parses as a name (`a9b4ade7`) is therefore refused as
	// an unresolved reference rather than written; a `0x` prefix makes it unambiguous.
	const named =
		typeof part.value === "string" && parseReference(part.value) !== undefined
			? part.value
			: undefined;
	const resolved = named === undefined ? { ok: true as const, value: part.value } : resolve(named);

	if (!resolved.ok) {
		return {
			ok: false,
			reason: `Data part ${position} is wired to "${named}", which did not resolve: ${resolved.reason}`,
		};
	}

	const wrong = (found: string): EncodedBytes => ({
		ok: false,
		reason: `Data part ${position} is declared ${String(type)}, which is ${declared.shape}. Got ${found}.`,
	});

	return declared.encoding === "integer"
		? encodeInteger(declared, resolved.value, order.order, wrong)
		: encodeBytes(declared, resolved.value, wrong);
}

/** `endian` is accepted only on integers; an asset id's reversal is already part of its type. */
function byteOrder(
	part: Record<string, unknown>,
	position: number,
	declared: PartType,
): { ok: false; reason: string } | { ok: true; order: "be" | "le" } {
	if (!("endian" in part)) {
		return { ok: true, order: "le" };
	}

	if (declared.encoding !== "integer") {
		return {
			ok: false,
			reason: `Data part ${position} carries endian, which applies only to an integer.`,
		};
	}

	const order = typeof part.endian === "string" ? BYTE_ORDERS[part.endian] : undefined;

	return order === undefined
		? {
				ok: false,
				reason: `Data part ${position} declares endian ${String(part.endian)}, and the byte orders are le and be.`,
			}
		: { ok: true, order };
}

function encodeInteger(
	declared: PartType,
	value: unknown,
	order: "be" | "le",
	wrong: (found: string) => EncodedBytes,
): EncodedBytes {
	const width = declared.bytes ?? 0;
	const count = asCount(value);

	if (count === undefined || count < 0n) {
		return wrong(quoted(value));
	}

	if (count > 2n ** BigInt(width * 8) - 1n) {
		return wrong(`${count}`);
	}

	const big = count.toString(16).padStart(width * 2, "0");

	return { hex: order === "be" ? big : reverseBytes(big), ok: true };
}

function encodeBytes(
	declared: PartType,
	value: unknown,
	wrong: (found: string) => EncodedBytes,
): EncodedBytes {
	if (typeof value !== "string") {
		return wrong(quoted(value));
	}

	const trimmed = value.trim();
	const digits = /^0x/i.test(trimmed) ? trimmed.slice(2) : trimmed;

	if (digits.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(digits)) {
		return wrong(quoted(value));
	}

	if (declared.bytes !== undefined && digits.length !== declared.bytes * 2) {
		return wrong(`${digits.length} hexadecimal characters`);
	}

	const lower = digits.toLowerCase();

	return { hex: declared.encoding === "reversedBytes" ? reverseBytes(lower) : lower, ok: true };
}

function reverseBytes(hex: string): string {
	return (hex.match(/../g) ?? []).toReversed().join("");
}

function quoted(value: unknown): string {
	const text = typeof value === "string" ? value : String(value);

	return `"${text.length > 24 ? `${text.slice(0, 24)}…` : text}"`;
}

function asCount(value: unknown): bigint | undefined {
	if (typeof value === "bigint") {
		return value;
	}

	if (typeof value === "number") {
		return Number.isSafeInteger(value) ? BigInt(value) : undefined;
	}

	return typeof value === "string" && /^-?\d+$/.test(value.trim())
		? BigInt(value.trim())
		: undefined;
}
