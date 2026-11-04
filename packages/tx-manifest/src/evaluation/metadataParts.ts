import { asArray, asRecord } from "../document/json";
import { parseReference } from "../document/references";
import { Refusal } from "../refusal";

type PartType = {
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

const UNSUPPORTED_MODIFIERS = ["align", "pad_to"];

export type PartResolver = (reference: string) => unknown;

export function encodeMetadataParts(
	data: unknown,
	resolve: PartResolver = (reference) => reference,
): string {
	const declared = asRecord(data)?.parts;

	if (!Array.isArray(declared)) {
		throw new Refusal("Object-form data carries no parts list.");
	}

	return asArray(declared)
		.map((entry, at) => {
			const part = asRecord(entry);

			if (!part) {
				throw new Refusal(`Data part ${at + 1} is not a typed value.`);
			}

			return encodePart(part, at + 1, resolve);
		})
		.join("");
}

function encodePart(
	part: Record<string, unknown>,
	position: number,
	resolve: PartResolver,
): string {
	for (const key of UNSUPPORTED_MODIFIERS) {
		if (key in part) {
			throw new Refusal(
				`Data part ${position} carries ${key}, which this runtime does not encode in data parts.`,
			);
		}
	}

	const type = part.type;
	const declared = typeof type === "string" ? PART_TYPES[type] : undefined;

	if (!declared) {
		throw new Refusal(
			`Data part ${position} is declared ${String(type)}, which object-form data does not have.`,
		);
	}

	if (!("value" in part)) {
		throw new Refusal(`Data part ${position}, declared ${type}, carries no value.`);
	}

	const order = byteOrder(part, position, declared);
	const named =
		typeof part.value === "string" && parseReference(part.value) !== undefined
			? part.value
			: undefined;
	const value =
		named === undefined
			? part.value
			: Refusal.amend(
					() => resolve(named),
					(reason) =>
						`Data part ${position} is wired to "${named}", which did not resolve: ${reason}`,
				);
	const wrong = (found: string) =>
		new Refusal(
			`Data part ${position} is declared ${String(type)}, which is ${declared.shape}. Got ${found}.`,
		);

	return declared.encoding === "integer"
		? encodeInteger(declared, value, order, wrong)
		: encodeBytes(declared, value, wrong);
}

function byteOrder(
	part: Record<string, unknown>,
	position: number,
	declared: PartType,
): "be" | "le" {
	if (!("endian" in part)) {
		return "le";
	}

	if (declared.encoding !== "integer") {
		throw new Refusal(`Data part ${position} carries endian, which applies only to an integer.`);
	}

	const order = typeof part.endian === "string" ? BYTE_ORDERS[part.endian] : undefined;

	if (order === undefined) {
		throw new Refusal(
			`Data part ${position} declares endian ${String(part.endian)}, and the byte orders are le and be.`,
		);
	}

	return order;
}

function encodeInteger(
	declared: PartType,
	value: unknown,
	order: "be" | "le",
	wrong: (found: string) => Refusal,
): string {
	const width = declared.bytes ?? 0;
	const count = asCount(value);

	if (count === undefined || count < 0n) {
		throw wrong(quoted(value));
	}

	if (count > 2n ** BigInt(width * 8) - 1n) {
		throw wrong(`${count}`);
	}

	const big = count.toString(16).padStart(width * 2, "0");

	return order === "be" ? big : reverseBytes(big);
}

function encodeBytes(
	declared: PartType,
	value: unknown,
	wrong: (found: string) => Refusal,
): string {
	if (typeof value !== "string") {
		throw wrong(quoted(value));
	}

	const trimmed = value.trim();
	const digits = /^0x/i.test(trimmed) ? trimmed.slice(2) : trimmed;

	if (digits.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(digits)) {
		throw wrong(quoted(value));
	}

	if (declared.bytes !== undefined && digits.length !== declared.bytes * 2) {
		throw wrong(`${digits.length} hexadecimal characters`);
	}

	const lower = digits.toLowerCase();

	return declared.encoding === "reversedBytes" ? reverseBytes(lower) : lower;
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
