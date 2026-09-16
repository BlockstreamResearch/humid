import { asArray, asRecord } from "../document/json";
import type { NormalisationNote } from "../document/normalise";
import { type ReferenceScope, resolveReference } from "../document/references";
import { computedValue, computesValue } from "../evaluation/computedValue";

/**
 * A contract's state, encoded into the leaves its address commits to.
 *
 * Simplicity keeps no state anywhere. A stateful contract's taproot tree carries its program in one
 * leaf and each state value in a hidden leaf beside it, so the address a contract's funds sit at is
 * decided by the state as much as by the program. Change a value and the funds are somewhere else.
 *
 * That is why this cannot be approximated. Encoding a value a byte differently from the way the
 * contract reads it derives an address that looks entirely valid and that nobody can spend from, so
 * everything here either encodes exactly what was stated or refuses.
 */
export type EncodeStateLeavesResult =
	| { leaves: string[]; ok: true }
	| { ok: false; reason: string };

/** A leaf is exactly this wide. The contracts read one with a single 32-byte hash step. */
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
	input: { at: string; notes?: NormalisationNote[]; scope: ReferenceScope },
): EncodeStateLeavesResult {
	const leaves: string[] = [];

	for (const [index, entry] of asArray(declared).entries()) {
		const encoded = encodeLeaf(entry, index, input);

		if (!encoded.ok) {
			return { ok: false, reason: `${input.at}: ${encoded.reason}` };
		}

		leaves.push(encoded.hex);
	}

	return { leaves, ok: true };
}

function encodeLeaf(
	declared: unknown,
	index: number,
	input: { notes?: NormalisationNote[]; scope: ReferenceScope },
): { hex: string; ok: true } | { ok: false; reason: string } {
	const node = asRecord(declared);
	const at = `state leaf ${index}`;

	if (!node) {
		return { ok: false, reason: `${at} is not a leaf this runtime can read.` };
	}

	if (node.type !== "tapdata") {
		return {
			ok: false,
			reason:
				`${at} is written as ${JSON.stringify(node.type)}, and tapdata is the only kind of ` +
				"leaf a contract's state is carried in.",
		};
	}

	const payload = asArray(node.payload);

	if (payload.length === 0) {
		return { ok: false, reason: `${at} carries no payload, so there is nothing to commit to.` };
	}

	const bytes: number[] = [];

	for (const [part, piece] of payload.entries()) {
		const encoded = encodePiece(piece, `${at} part ${part}`, input);

		if (!encoded.ok) {
			return encoded;
		}

		bytes.push(...encoded.bytes);
	}

	if (bytes.length !== LEAF_BYTES) {
		return {
			ok: false,
			reason:
				`${at} encodes to ${bytes.length} bytes, and a leaf is ${LEAF_BYTES}. A contract reads ` +
				`its state in ${LEAF_BYTES}-byte steps, so a leaf of any other width commits to ` +
				"something the contract cannot read back.",
		};
	}

	return { hex: bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(""), ok: true };
}

function encodePiece(
	declared: unknown,
	at: string,
	input: { notes?: NormalisationNote[]; scope: ReferenceScope },
): { bytes: number[]; ok: true } | { ok: false; reason: string } {
	if (typeof declared === "string") {
		const raw = hexBytes(declared);

		return raw === undefined
			? {
					ok: false,
					reason: `${at} is written as ${JSON.stringify(declared)}, which is not bytes.`,
				}
			: { bytes: raw, ok: true };
	}

	const node = asRecord(declared);

	if (!node) {
		return { ok: false, reason: `${at} is neither bytes nor a value to encode.` };
	}

	const declaredType = typeof node.type === "string" ? node.type : undefined;
	const width = declaredType === undefined ? undefined : WIDTHS[declaredType];

	if (width === undefined) {
		return {
			ok: false,
			reason:
				`${at} is declared ${JSON.stringify(node.type)}, which this runtime does not encode ` +
				"into a state leaf.",
		};
	}

	const read = readValue(node.value, at, input);

	if (!read.ok) {
		return read;
	}

	const natural =
		width.reads === "hex"
			? fromHex(read.value, width.bytes, at)
			: fromNumber(read.value, width.bytes, at);

	if (!natural.ok) {
		return natural;
	}

	const ordered = orderBytes(natural.bytes, node.endian, at);

	if (!ordered.ok) {
		return ordered;
	}

	return padBytes(ordered.bytes, node.pad_to, node.align, at);
}

function readValue(
	declared: unknown,
	at: string,
	input: { notes?: NormalisationNote[]; scope: ReferenceScope },
): { ok: true; value: string } | { ok: false; reason: string } {
	if (typeof declared !== "string") {
		return { ok: false, reason: `${at} names no value to encode.` };
	}

	const found = resolveReference(declared, "stateLeaf", input.scope);

	if (found.ok) {
		return typeof found.value === "string"
			? { ok: true, value: found.value }
			: { ok: false, reason: `${at} resolves to a value this runtime cannot encode.` };
	}

	if (computesValue(declared)) {
		const computed = computedValue(declared, "stateLeaf", input.scope, input.notes);

		return computed.ok ? computed : { ok: false, reason: `${at}: ${computed.reason}` };
	}

	return declared.startsWith("$") || declared.includes(".")
		? { ok: false, reason: `${at}: ${found.reason}` }
		: { ok: true, value: declared };
}

function fromNumber(
	value: string,
	bytes: number,
	at: string,
): { bytes: number[]; ok: true } | { ok: false; reason: string } {
	const text = value.trim();
	const parsed = /^\d+$/.test(text) ? BigInt(text) : undefined;

	if (parsed === undefined) {
		return {
			ok: false,
			reason: `${at} is written as ${JSON.stringify(value)}, which is not a whole number.`,
		};
	}

	if (parsed >= 1n << BigInt(bytes * 8)) {
		return {
			ok: false,
			reason: `${at} is ${text}, which does not fit in the ${bytes} bytes its type is wide.`,
		};
	}

	const out: number[] = [];

	for (let index = bytes - 1; index >= 0; index -= 1) {
		out.push(Number((parsed >> BigInt(index * 8)) & 0xffn));
	}

	return { bytes: out, ok: true };
}

function fromHex(
	value: string,
	bytes: number,
	at: string,
): { bytes: number[]; ok: true } | { ok: false; reason: string } {
	const raw = hexBytes(value);

	if (raw === undefined) {
		return {
			ok: false,
			reason: `${at} is written as ${JSON.stringify(value)}, which is not bytes.`,
		};
	}

	return raw.length === bytes
		? { bytes: raw, ok: true }
		: {
				ok: false,
				reason: `${at} is ${raw.length} bytes, and its type is ${bytes} bytes wide.`,
			};
}

function orderBytes(
	bytes: number[],
	endian: unknown,
	at: string,
): { bytes: number[]; ok: true } | { ok: false; reason: string } {
	if (bytes.length === 1) {
		return { bytes, ok: true };
	}

	if (endian === "be") {
		return { bytes, ok: true };
	}

	if (endian === "le") {
		return { bytes: bytes.toReversed(), ok: true };
	}

	return {
		ok: false,
		reason:
			`${at} spans ${bytes.length} bytes and does not say which end they run from. The same ` +
			"number written either way is two different addresses, and this runtime will not pick one.",
	};
}

function padBytes(
	bytes: number[],
	padTo: unknown,
	align: unknown,
	at: string,
): { bytes: number[]; ok: true } | { ok: false; reason: string } {
	if (padTo === undefined) {
		return { bytes, ok: true };
	}

	if (typeof padTo !== "number" || !Number.isInteger(padTo) || padTo < 0) {
		return {
			ok: false,
			reason: `${at} is padded to ${JSON.stringify(padTo)}, which is not a width.`,
		};
	}

	if (padTo < bytes.length) {
		return {
			ok: false,
			reason: `${at} is ${bytes.length} bytes and is padded to ${padTo}, which would lose part of it.`,
		};
	}

	if (padTo === bytes.length) {
		return { bytes, ok: true };
	}

	const filling = Array.from({ length: padTo - bytes.length }, () => 0);

	if (align === "right") {
		return { bytes: [...filling, ...bytes], ok: true };
	}

	if (align === "left") {
		return { bytes: [...bytes, ...filling], ok: true };
	}

	return {
		ok: false,
		reason:
			`${at} is padded from ${bytes.length} bytes to ${padTo} and does not say which end it sits ` +
			"at. Either end is a different leaf, and this runtime will not pick one.",
	};
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
