import { z } from "zod";

import { decodeHex, encodeHex } from "../chain/hex";
import { parseReference } from "../document/references";
import { type Leaf, leafSchema } from "../document/schema";
import { Refusal } from "../refusal";
import { Expression } from "../values/expression";
import { Scope, type ScopeParts } from "../values/scope";

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
	input: { at: string; scope: ScopeParts },
): EncodeStateLeavesResult {
	const parsed = z.array(leafSchema).safeParse(declared);

	if (!parsed.success) {
		return { ok: false, reason: `${input.at}: ${z.prettifyError(parsed.error)}` };
	}

	try {
		return {
			leaves: stateLeavesOf(parsed.data, { at: input.at, scope: new Scope(input.scope) }),
			ok: true,
		};
	} catch (error) {
		if (error instanceof Refusal) {
			return { ok: false, reason: error.reason };
		}

		throw error;
	}
}

export function stateLeavesOf(declared: Leaf[], input: { at: string; scope: Scope }): string[] {
	return declared.map((entry, index) =>
		Refusal.amend(
			() => encodeLeaf(entry, index, input),
			(reason) => `${input.at}: ${reason}`,
		),
	);
}

function encodeLeaf(leaf: Leaf, index: number, input: { scope: Scope }): string {
	const at = `state leaf ${index}`;

	if (leaf.type !== "tapdata") {
		throw new Refusal(
			`${at} is written as ${JSON.stringify(leaf.type)}, and tapdata is the only kind of ` +
				"leaf a contract's state is carried in.",
		);
	}

	const { payload } = leaf;

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

	return encodeHex(Uint8Array.from(bytes));
}

function encodePiece(
	declared: Leaf["payload"][number],
	at: string,
	input: { scope: Scope },
): number[] {
	if (typeof declared === "string") {
		const raw = hexBytes(declared);

		if (raw === undefined) {
			throw new Refusal(`${at} is written as ${JSON.stringify(declared)}, which is not bytes.`);
		}

		return raw;
	}

	const width = WIDTHS[declared.type];

	if (width === undefined) {
		throw new Refusal(
			`${at} is declared ${JSON.stringify(declared.type)}, which this runtime does not encode ` +
				"into a state leaf.",
		);
	}

	const value = readValue(declared.value, at, input);
	const natural =
		width.reads === "hex" ? fromHex(value, width.bytes, at) : fromNumber(value, width.bytes, at);

	return padBytes(orderBytes(natural, declared.endian, at), declared.pad_to, declared.align, at);
}

function readValue(declared: string, at: string, input: { scope: Scope }): string {
	const found = Refusal.amend(
		() => leafValue(declared, input.scope),
		(reason) => `${at}: ${reason}`,
	);

	if (typeof found !== "string") {
		throw new Refusal(`${at} resolves to a value this runtime cannot encode.`);
	}

	return found;
}

function leafValue(declared: string, scope: Scope): unknown {
	if (Expression.computes(declared)) {
		return String(scope.integer(declared, "stateLeaf"));
	}

	const reference = parseReference(declared);

	if (reference === undefined) {
		return declared;
	}

	return reference.form === "bare"
		? (Refusal.attempt(() => scope.reference(declared, "stateLeaf")) ?? declared)
		: scope.reference(declared, "stateLeaf");
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

function orderBytes(bytes: number[], endian: string | undefined, at: string): number[] {
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

function padBytes(
	bytes: number[],
	padTo: number | undefined,
	align: string | undefined,
	at: string,
): number[] {
	if (padTo === undefined) {
		return bytes;
	}

	if (!Number.isInteger(padTo) || padTo < 0) {
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
	const raw = decodeHex(text.trim());

	return raw && raw.length > 0 ? [...raw] : undefined;
}
