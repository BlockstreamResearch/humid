import { encodeHex, reverseHex } from "../chain/hex";
import type { DataPart } from "../document/schema";
import { FormatType } from "../programs/formatTypes";
import { quoted, Refusal } from "../refusal";
import { parseReference } from "../values/references";

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

	const format = Refusal.amend(
		() => FormatType.named(part.type),
		() => `Data part ${position} is declared ${part.type}, which object-form data does not have.`,
	);

	if (part.value === undefined) {
		throw new Refusal(`Data part ${position}, declared ${part.type}, carries no value.`);
	}

	const order = byteOrder(part, position, format);
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
	const written =
		typeof value === "string" || typeof value === "number" || typeof value === "bigint"
			? String(value)
			: undefined;

	if (written === undefined) {
		throw new Refusal(`Data part ${position} is ${quoted(value)}, which is not a value to encode.`);
	}

	const hex = encodeHex(
		Refusal.amend(
			() => format.bytes(written),
			(reason) => `Data part ${position}: ${reason}`,
		),
	);

	return (format.isInteger ? order === "le" : format.isReversed) ? reverseHex(hex) : hex;
}

function byteOrder(part: DataPart, position: number, format: FormatType): "be" | "le" {
	if (part.endian === undefined) {
		return "le";
	}

	if (!format.isInteger) {
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
