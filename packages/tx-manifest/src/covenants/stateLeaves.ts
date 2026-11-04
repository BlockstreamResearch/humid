import { asArray, asRecord } from "../document/json";
import { type ReferenceScope, resolveReference } from "../document/references";
import { computedValue, computesValue } from "../evaluation/computedValue";
import { Refusal } from "../refusal";

export type EncodeStateLeavesResult =
	| { leaves: string[]; ok: true }
	| { ok: false; reason: string };

const LEAF_BYTES = 32;

type Width = { bytes: number; reads: "decimal" | "hex" };

const WIDTHS: Record<string, Width> = {
	bool: { bytes: 1, reads: "decimal" },
	bytes32: { bytes: 32, reads: "hex" },
	"liquid.asset_id": { bytes: 32, reads: "hex" },
	pubkey: { bytes: 32, reads: "hex" },
	u8: { bytes: 1, reads: "decimal" },
	u16: { bytes: 2, reads: "decimal" },
	u32: { bytes: 4, reads: "decimal" },
	u64: { bytes: 8, reads: "decimal" },
};

export function encodeStateLeaves(
	declared: unknown,
	input: { at: string; scope: ReferenceScope },
): EncodeStateLeavesResult {
	try {
		return { leaves: stateLeavesOf(declared, input), ok: true };
	} catch (error) {
		if (error instanceof Refusal) {
			return { ok: false, reason: error.reason };
		}

		throw error;
	}
}

export function stateLeavesOf(
	declared: unknown,
	input: { at: string; scope: ReferenceScope },
): string[] {
	return asArray(declared).map((entry, index) =>
		Refusal.amend(
			() => encodeLeaf(entry, index, input),
			(reason) => `${input.at}: ${reason}`,
		),
	);
}

function encodeLeaf(declared: unknown, index: number, input: { scope: ReferenceScope }): string {
	const node = asRecord(declared);
	const at = `state leaf ${index}`;

	if (!node) {
		throw new Refusal(`${at} is not a leaf this runtime can read.`);
	}

	if (node.type !== "tapdata") {
		throw new Refusal(
			`${at} is written as ${JSON.stringify(node.type)}, and tapdata is the only kind of ` +
				"leaf a contract's state is carried in.",
		);
	}

	const payload = asArray(node.payload);

	if (payload.length === 0) {
		throw new Refusal(`${at} carries no payload, so there is nothing to commit to.`);
	}

	const bytes = payload.flatMap((piece, part) => encodePiece(piece, `${at} part ${part}`, input));

	if (bytes.length !== LEAF_BYTES) {
		throw new Refusal(
			`${at} encodes to ${bytes.length} bytes, and a leaf is ${LEAF_BYTES}. A contract reads ` +
				`its state in ${LEAF_BYTES}-byte steps, so a leaf of any other width commits to ` +
				"something the contract cannot read back.",
		);
	}

	return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encodePiece(declared: unknown, at: string, input: { scope: ReferenceScope }): number[] {
	if (typeof declared === "string") {
		const raw = hexBytes(declared);

		if (raw === undefined) {
			throw new Refusal(`${at} is written as ${JSON.stringify(declared)}, which is not bytes.`);
		}

		return raw;
	}

	const node = asRecord(declared);

	if (!node) {
		throw new Refusal(`${at} is neither bytes nor a value to encode.`);
	}

	const declaredType = typeof node.type === "string" ? node.type : undefined;
	const width = declaredType === undefined ? undefined : WIDTHS[declaredType];

	if (width === undefined) {
		throw new Refusal(
			`${at} is declared ${JSON.stringify(node.type)}, which this runtime does not encode ` +
				"into a state leaf.",
		);
	}

	const value = readValue(node.value, at, input);
	const natural =
		width.reads === "hex" ? fromHex(value, width.bytes, at) : fromNumber(value, width.bytes, at);

	return padBytes(orderBytes(natural, node.endian, at), node.pad_to, node.align, at);
}

function readValue(declared: unknown, at: string, input: { scope: ReferenceScope }): string {
	if (typeof declared !== "string") {
		throw new Refusal(`${at} names no value to encode.`);
	}

	let found: unknown;

	try {
		found = resolveReference(declared, "stateLeaf", input.scope).value;
	} catch (error) {
		if (!(error instanceof Refusal)) {
			throw error;
		}

		if (computesValue(declared)) {
			return Refusal.amend(
				() => computedValue(declared, "stateLeaf", input.scope),
				(reason) => `${at}: ${reason}`,
			);
		}

		if (declared.startsWith("$") || declared.includes(".")) {
			throw new Refusal(`${at}: ${error.reason}`);
		}

		return declared;
	}

	if (typeof found !== "string") {
		throw new Refusal(`${at} resolves to a value this runtime cannot encode.`);
	}

	return found;
}

function fromNumber(value: string, bytes: number, at: string): number[] {
	const text = value.trim();
	const parsed = /^\d+$/.test(text) ? BigInt(text) : undefined;

	if (parsed === undefined) {
		throw new Refusal(`${at} is written as ${JSON.stringify(value)}, which is not a whole number.`);
	}

	if (parsed >= 1n << BigInt(bytes * 8)) {
		throw new Refusal(
			`${at} is ${text}, which does not fit in the ${bytes} bytes its type is wide.`,
		);
	}

	return Array.from({ length: bytes }, (_, index) =>
		Number((parsed >> BigInt((bytes - 1 - index) * 8)) & 0xffn),
	);
}

function fromHex(value: string, bytes: number, at: string): number[] {
	const raw = hexBytes(value);

	if (raw === undefined) {
		throw new Refusal(`${at} is written as ${JSON.stringify(value)}, which is not bytes.`);
	}

	if (raw.length !== bytes) {
		throw new Refusal(`${at} is ${raw.length} bytes, and its type is ${bytes} bytes wide.`);
	}

	return raw;
}

function orderBytes(bytes: number[], endian: unknown, at: string): number[] {
	if (bytes.length === 1 || endian === "be") {
		return bytes;
	}

	if (endian === "le") {
		return bytes.toReversed();
	}

	throw new Refusal(
		`${at} spans ${bytes.length} bytes and does not say which end they run from. The same ` +
			"number written either way is two different addresses, and this runtime will not pick one.",
	);
}

function padBytes(bytes: number[], padTo: unknown, align: unknown, at: string): number[] {
	if (padTo === undefined) {
		return bytes;
	}

	if (typeof padTo !== "number" || !Number.isInteger(padTo) || padTo < 0) {
		throw new Refusal(`${at} is padded to ${JSON.stringify(padTo)}, which is not a width.`);
	}

	if (padTo < bytes.length) {
		throw new Refusal(
			`${at} is ${bytes.length} bytes and is padded to ${padTo}, which would lose part of the value.`,
		);
	}

	const filling = Array.from({ length: padTo - bytes.length }, () => 0);

	if (filling.length === 0) {
		return bytes;
	}

	if (align === "right") {
		return [...filling, ...bytes];
	}

	if (align === "left") {
		return [...bytes, ...filling];
	}

	throw new Refusal(
		`${at} is padded from ${bytes.length} bytes to ${padTo} and does not say which end it sits ` +
			"at. Either end is a different leaf, and this runtime will not pick one.",
	);
}

function hexBytes(text: string): number[] | undefined {
	const digits = text.trim().replace(/^0x/i, "");

	if (digits.length === 0 || digits.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(digits)) {
		return undefined;
	}

	const out: number[] = [];

	for (let index = 0; index < digits.length; index += 2) {
		out.push(Number.parseInt(digits.slice(index, index + 2), 16));
	}

	return out;
}
