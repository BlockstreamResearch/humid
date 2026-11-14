import { reverseHex, withoutHexPrefix } from "../chain/hex";
import { integerOf } from "../chain/integers";
import { parseReference } from "../document/references";
import type { DataPart } from "../document/schema";
import { quoted, Refusal } from "../refusal";

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

const UNSUPPORTED_MODIFIERS = ["align", "pad_to"] as const;

export type PartResolver = (reference: string) => unknown;

const CONCAT = /^concat\((?<items>.*)\)$/s;

export function concatParts(
	expression: string,
	declaredTypes: Record<string, string>,
): { parts: DataPart[] } {
	const items = CONCAT.exec(expression.trim())?.groups?.items;

	if (items === undefined) {
		throw new Refusal(`String-form data is "${expression}", which is not a concat(…) of values.`);
	}

	return {
		parts: items
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean)
			.map((value) => {
				const reference = parseReference(value);
				const type =
					reference?.form === "input-attribute" ? undefined : declaredTypes[reference?.name ?? ""];

				return { type: type === "liquid.asset_id" ? type : "bytes", value };
			}),
	};
}

export function encodeMetadataParts(
	data: { parts: DataPart[] },
	resolve: PartResolver = (reference) => reference,
): string {
	return data.parts.map((part, at) => encodePart(part, at + 1, resolve)).join("");
}

function encodePart(part: DataPart, position: number, resolve: PartResolver): string {
	for (const key of UNSUPPORTED_MODIFIERS) {
		if (part[key] !== undefined) {
			throw new Refusal(
				`Data part ${position} carries ${key}, which this runtime does not encode in data parts.`,
			);
		}
	}

	const { type } = part;
	const declared = PART_TYPES[type];

	if (!declared) {
		throw new Refusal(
			`Data part ${position} is declared ${type}, which object-form data does not have.`,
		);
	}

	if (part.value === undefined) {
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
			`Data part ${position} is declared ${type}, which is ${declared.shape}. Got ${found}.`,
		);

	return declared.encoding === "integer"
		? encodeInteger(declared, value, order, wrong)
		: encodeBytes(declared, value, wrong);
}

function byteOrder(part: DataPart, position: number, declared: PartType): "be" | "le" {
	if (part.endian === undefined) {
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
	const count = integerOf(value);

	if (count === undefined || count < 0n) {
		throw wrong(quoted(value));
	}

	if (count > 2n ** BigInt(width * 8) - 1n) {
		throw wrong(`${count}`);
	}

	const big = count.toString(16).padStart(width * 2, "0");

	return order === "be" ? big : reverseHex(big);
}

function encodeBytes(
	declared: PartType,
	value: unknown,
	wrong: (found: string) => Refusal,
): string {
	if (typeof value !== "string") {
		throw wrong(quoted(value));
	}

	const digits = withoutHexPrefix(value.trim());

	if (digits.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(digits)) {
		throw wrong(quoted(value));
	}

	if (declared.bytes !== undefined && digits.length !== declared.bytes * 2) {
		throw wrong(`${digits.length} hexadecimal characters`);
	}

	const lower = digits.toLowerCase();

	return declared.encoding === "reversedBytes" ? reverseHex(lower) : lower;
}
