/**
 * Reading a transaction's outputs out of its own bytes — one of them, or all of them.
 *
 * The wallet needs three things about a covenant output before it will spend it: the script
 * that locks it, so the rebuilt contract can be compared against it; its amount and asset,
 * for what a person is shown; and the output exactly as it is serialised, to hand to the
 * signing module.
 *
 * All three come from the same bytes rather than from three fields of a summary. That is not
 * tidiness: an output re-encoded from a summary is a second opinion about what the chain
 * holds, and a covenant that disagrees with the chain by one byte fails somewhere far from
 * the cause.
 */

import { decodeHex, encodeHex, readHex, readUintBigEndian, readVarint, skip } from "./bytes";
import type { Reader } from "./bytes";

export type ParsedTxOut = {
	/** Base-unit amount, when the output is explicit rather than confidential. */
	amountSats?: string;
	/** Raw asset id as it is written, when the output is explicit rather than confidential. */
	rawAssetId?: string;
	/** The script that locks the output, in hex. */
	scriptPubKeyHex: string;
	/** The output exactly as it is serialised: asset, value, nonce, then the script. */
	txOutHex: string;
};

export type TxOutAt = { ok: true; txOut: ParsedTxOut } | { ok: false; reason: string };

/**
 * The output at `vout` of a consensus-encoded Elements transaction.
 *
 * Walks the whole input list to get there, issuance data included — an input that issues an
 * asset carries four more fields, and a reader that does not know that lands mid-output and
 * reports something well-formed and wrong.
 */
export function txOutAt(transactionHex: string, vout: number): TxOutAt {
	const found = readerAtOutputs(transactionHex);

	if (!found.ok) {
		return { ok: false, reason: found.reason };
	}

	if (!Number.isInteger(vout) || vout < 0) {
		return { ok: false, reason: `Not an output index: ${vout}` };
	}

	if (BigInt(vout) >= found.outputCount) {
		return { ok: false, reason: `The transaction has no output at index ${vout}.` };
	}

	for (let index = 0; index < vout; index += 1) {
		if (!skipOutput(found.reader)) {
			return { ok: false, reason: `The transaction ends inside output ${index}.` };
		}
	}

	const txOut = readOutput(found.reader);

	return txOut === undefined
		? { ok: false, reason: `The transaction ends inside output ${vout}.` }
		: { ok: true, txOut };
}

export type TxOutsOf = { ok: true; txOuts: ParsedTxOut[] } | { ok: false; reason: string };

/**
 * Every output of a consensus-encoded Elements transaction, in the order it carries them.
 *
 * Reading one output answers a question about one outpoint. Reading all of them answers a
 * question about the transaction, which is what checking a finished transaction against what
 * was agreed to takes: whether an output landed where it was put, and whether it came back
 * carrying what it was built to carry, are both questions about positions rather than about a
 * position. Walking once is also the difference between one pass and one pass per output.
 */
export function txOutsOf(transactionHex: string): TxOutsOf {
	const found = readerAtOutputs(transactionHex);

	if (!found.ok) {
		return { ok: false, reason: found.reason };
	}

	const txOuts: ParsedTxOut[] = [];

	for (let index = 0n; index < found.outputCount; index += 1n) {
		const txOut = readOutput(found.reader);

		if (txOut === undefined) {
			return { ok: false, reason: `The transaction ends inside output ${index}.` };
		}

		txOuts.push(txOut);
	}

	return { ok: true, txOuts };
}

type AtOutputs = { ok: false; reason: string } | { ok: true; outputCount: bigint; reader: Reader };

/**
 * A reader positioned at the first output, and how many follow.
 *
 * Walks the whole input list to get there, issuance data included — an input that issues an
 * asset carries four more fields, and a reader that does not know that lands mid-output and
 * reports something well-formed and wrong.
 */
function readerAtOutputs(transactionHex: string): AtOutputs {
	const bytes = decodeHex(transactionHex);

	if (!bytes) {
		return { ok: false, reason: "The transaction is not hex." };
	}

	const reader: Reader = { at: 0, bytes };

	// Version, then the marker Elements uses to say whether witness data follows.
	if (!skip(reader, 5)) {
		return { ok: false, reason: "The transaction ends before its inputs." };
	}

	const inputCount = readVarint(reader);

	if (inputCount === undefined) {
		return { ok: false, reason: "The transaction declares no input count." };
	}

	for (let index = 0n; index < inputCount; index += 1n) {
		if (!skipInput(reader)) {
			return { ok: false, reason: `The transaction ends inside input ${index}.` };
		}
	}

	const outputCount = readVarint(reader);

	return outputCount === undefined
		? { ok: false, reason: "The transaction declares no output count." }
		: { ok: true, outputCount, reader };
}

/** One output, read from wherever the reader currently sits. */
function readOutput(reader: Reader): ParsedTxOut | undefined {
	const start = reader.at;
	const asset = readField(reader, 32);
	const value = readField(reader, 8);
	const nonce = readField(reader, 32);
	const scriptLength = readVarint(reader);

	if (
		asset === undefined ||
		value === undefined ||
		nonce === undefined ||
		scriptLength === undefined
	) {
		return undefined;
	}

	const scriptPubKeyHex = readHex(reader, Number(scriptLength));

	if (scriptPubKeyHex === undefined) {
		return undefined;
	}

	return {
		// An asset id is written in reverse of how it is displayed, and every consumer here
		// wants the displayed form.
		...(asset.explicit ? { rawAssetId: reverseHex(asset.body) } : {}),
		...(value.explicit ? { amountSats: String(bigEndian(value.body)) } : {}),
		scriptPubKeyHex,
		txOutHex: encodeHex(reader.bytes.slice(start, reader.at)),
	};
}

type Field = { body: string; explicit: boolean };

/**
 * One of Elements' three-state fields: absent, explicit, or a commitment that hides the value.
 *
 * The prefix says which. `0x00` is nothing at all; `0x01` is explicit and carries as many bytes
 * as that field's explicit form takes; anything else is a commitment, which is always 32 bytes
 * whatever it commits to.
 */
function readField(reader: Reader, explicitLength: number): Field | undefined {
	const prefix = reader.bytes[reader.at];

	if (prefix === undefined) {
		return undefined;
	}

	reader.at += 1;

	if (prefix === 0x00) {
		return { body: "", explicit: false };
	}

	const body = readHex(reader, prefix === 0x01 ? explicitLength : 32);

	return body === undefined ? undefined : { body, explicit: prefix === 0x01 };
}

function skipOutput(reader: Reader): boolean {
	if (
		readField(reader, 32) === undefined ||
		readField(reader, 8) === undefined ||
		readField(reader, 32) === undefined
	) {
		return false;
	}

	const scriptLength = readVarint(reader);

	return scriptLength !== undefined && skip(reader, Number(scriptLength));
}

/** The issuance and peg-in markers Elements keeps in the top two bits of the output index. */
const ISSUANCE = 0x80_00_00_00;

/** What a coinbase input writes where an output index would go. */
const NO_OUTPOINT = 0xff_ff_ff_ff;

function skipInput(reader: Reader): boolean {
	const previousTxid = readHex(reader, 32);
	const index = readRawUint32(reader);
	const scriptLength = readVarint(reader);

	if (previousTxid === undefined || index === undefined || scriptLength === undefined) {
		return false;
	}

	// Script, then sequence.
	if (!skip(reader, Number(scriptLength) + 4)) {
		return false;
	}

	// A coinbase spends nothing, and says so by writing an all-zero transaction and an index
	// of every bit set — which happens to include the issuance marker. Reading that as an
	// issuance walks 64 bytes into the outputs and reports something well-formed and wrong,
	// so the null outpoint is checked before the marker means anything.
	const spendsNothing = index === NO_OUTPOINT && /^0*$/.test(previousTxid);

	if (spendsNothing || (index & ISSUANCE) === 0) {
		return true;
	}

	// An issuance carries a blinding nonce, an entropy, the amount issued and the inflation
	// keys, in that order.
	return (
		skip(reader, 64) && readField(reader, 8) !== undefined && readField(reader, 8) !== undefined
	);
}

function readRawUint32(reader: Reader): number | undefined {
	if (reader.at + 4 > reader.bytes.length) {
		return undefined;
	}

	let value = 0;

	for (let offset = 3; offset >= 0; offset -= 1) {
		value = value * 256 + (reader.bytes[reader.at + offset] ?? 0);
	}

	reader.at += 4;

	return value >>> 0;
}

function reverseHex(hex: string): string {
	return (hex.match(/../g) ?? []).toReversed().join("");
}

function bigEndian(hex: string): bigint {
	const bytes = decodeHex(hex);

	if (!bytes) {
		return 0n;
	}

	return readUintBigEndian({ at: 0, bytes }, bytes.length) ?? 0n;
}
