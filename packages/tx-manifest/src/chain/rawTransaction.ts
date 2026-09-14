/**
 * Reading a finished transaction out of its own bytes.
 *
 * Everything here exists so that what a signing module says it built can be checked against
 * what it actually built. A module's own account of itself is the one source that cannot
 * answer that question — it would be the same component reporting on itself — so the guards
 * that follow read the bytes that would reach the network instead.
 *
 * **The whole transaction is parsed before any of it is reported.** Reading as far as the
 * inputs and stopping is enough to answer "what does it spend" and is not enough to answer
 * "is this a transaction": bytes whose prefix happens to parse can carry a truncated witness,
 * no locktime, or anything at all after the part that was read, and a guard handed the prefix
 * would approve them. So one pass walks version, marker, inputs, outputs, locktime and — when
 * the marker says so — every input's and every output's witness, and then requires that the
 * bytes are exhausted. What is left over is not slack; it is the part nobody checked.
 *
 * **Nothing here guesses.** Every field is read against the prefixes the encoding actually
 * defines for it, every count and length against the compact form's canonical widths, and
 * anything else refuses. A reader that treated an unrecognised prefix as a commitment would
 * report a malformed transaction as one carrying hidden amounts — which is exactly the shape a
 * guard built on it is least able to tell from the real thing.
 *
 * One parse serves both questions below, so the two cannot come to disagree about what they
 * are looking at.
 */

import {
	decodeHex,
	type Reader,
	readHex,
	readReversedHex,
	readUint8,
	readUint32,
	readUintBigEndian,
	skip,
} from "./bytes";
import type { Outpoint } from "./outpoint";

/** The issuance and peg-in markers Elements keeps in the top two bits of the output index. */
const ISSUANCE_FLAG = 0x80_00_00_00;
const OUTPOINT_INDEX = 0x3f_ff_ff_ff;

/** What a coinbase input writes where an output index would go. */
const NO_OUTPOINT = 0xff_ff_ff_ff;

/** The bit of the marker that says witness data follows the locktime. */
const WITNESS_PRESENT = 0x01;

/**
 * Which of its three answers one of Elements' fields actually gave.
 *
 * Carried rather than collapsed into "was there a number". An output is blinded or open as a
 * whole — asset, value and nonce together — and a mixture is neither: an output committing to
 * its value while publishing its asset, or hiding both and carrying no nonce for anyone to
 * unblind with, is not a smaller version of either shape. Reduced to one boolean those are
 * indistinguishable from the real thing, and a guard reading the boolean approves them.
 */
export type FieldForm = "commitment" | "explicit" | "null";

export type ParsedTxOut = {
	/** Base-unit amount, when the output states one rather than committing to it. */
	amountSats?: string;
	/** Whether the asset is stated, committed to, or absent. */
	assetForm: FieldForm;
	/** Whether the nonce is present, which is what an open output must not carry. */
	nonceForm: FieldForm;
	/** The asset id as it is displayed, when the output states one rather than committing to it. */
	rawAssetId?: string;
	/** The script that locks the output, in hex. Empty for the fee, which locks to nothing. */
	scriptPubKeyHex: string;
	/** Whether the amount is stated, committed to, or absent. */
	valueForm: FieldForm;
};

export type ParsedTransaction = { spent: Outpoint[]; txOuts: ParsedTxOut[] };

export type ParseResult =
	| { ok: false; reason: string }
	| { ok: true; transaction: ParsedTransaction };

export type SpentInputs = { ok: true; spent: Outpoint[] } | { ok: false; reason: string };

/**
 * The outpoints a finished transaction spends, read out of its own bytes.
 *
 * A whole transaction is parsed to answer this, not the front of one. What it spends is not
 * knowable from bytes that were never shown to be a transaction: a prefix that parses can be
 * followed by anything, and "anything" includes a second set of inputs.
 */
export function spentInputs(transactionHex: string): SpentInputs {
	const parsed = parseTransaction(transactionHex);

	return parsed.ok ? { ok: true, spent: parsed.transaction.spent } : parsed;
}

export type TxOutsOf = { ok: true; txOuts: ParsedTxOut[] } | { ok: false; reason: string };

/**
 * Every output of a finished transaction, in the order it carries them.
 *
 * Order is the point rather than a convenience: whether an output landed where the wallet put
 * it, and whether it came back carrying what it was built to carry, are both questions about
 * positions rather than about a position.
 */
export function txOutsOf(transactionHex: string): TxOutsOf {
	const parsed = parseTransaction(transactionHex);

	return parsed.ok ? { ok: true, txOuts: parsed.transaction.txOuts } : parsed;
}

/**
 * One complete Elements transaction, or the reason these bytes are not one.
 *
 * The order is the encoding's own and is not the one Bitcoin uses: version, marker, inputs,
 * outputs, **locktime**, and only then the witnesses. A reader that expected the witness before
 * the locktime would reject every real transaction that carries one, and — worse — accept some
 * that do not.
 */
export function parseTransaction(transactionHex: string): ParseResult {
	const bytes = decodeHex(transactionHex);

	if (!bytes) {
		return { ok: false, reason: "The signed transaction is not hex." };
	}

	const reader: Reader = { at: 0, bytes };

	// The version, then the one-byte marker saying whether witness data follows. The marker is
	// read rather than stepped over: it is either absent or present, and a byte that is neither
	// means everything after this is being read at the wrong offset.
	if (!skip(reader, 4)) {
		return { ok: false, reason: "The signed transaction ends before its inputs." };
	}

	const marker = readUint8(reader);

	if (marker === undefined) {
		return { ok: false, reason: "The signed transaction ends before its inputs." };
	}

	if (marker !== 0x00 && marker !== WITNESS_PRESENT) {
		return {
			ok: false,
			reason: `The signed transaction declares a witness marker of ${marker}, which is neither absent nor present.`,
		};
	}

	const inputCount = readCount(reader);

	if (inputCount === undefined) {
		return { ok: false, reason: "The signed transaction declares no readable input count." };
	}

	const spent: Outpoint[] = [];

	for (let index = 0; index < inputCount; index += 1) {
		const outpoint = readInput(reader);

		if (outpoint === undefined) {
			return { ok: false, reason: `The signed transaction ends inside input ${index}.` };
		}

		spent.push(outpoint);
	}

	const outputCount = readCount(reader);

	if (outputCount === undefined) {
		return { ok: false, reason: "The signed transaction declares no readable output count." };
	}

	const txOuts: ParsedTxOut[] = [];

	for (let index = 0; index < outputCount; index += 1) {
		const txOut = readOutput(reader);

		if (txOut === undefined) {
			return { ok: false, reason: `The signed transaction ends inside output ${index}.` };
		}

		txOuts.push(txOut);
	}

	// The locktime, which Elements writes before the witnesses rather than after them.
	if (!skip(reader, 4)) {
		return { ok: false, reason: "The signed transaction ends before its locktime." };
	}

	if (marker === WITNESS_PRESENT && !skipWitnesses(reader, inputCount, outputCount)) {
		return {
			ok: false,
			reason:
				"The signed transaction says it carries witness data and does not carry all of it. " +
				"Nothing is returned.",
		};
	}

	// What is left over is not slack. Whatever it is, nothing above looked at it, and a
	// transaction with a tail nobody read is a transaction this wallet cannot vouch for.
	if (reader.at !== bytes.length) {
		return {
			ok: false,
			reason: `The signed transaction carries ${bytes.length - reader.at} bytes after the end of it.`,
		};
	}

	return { ok: true, transaction: { spent, txOuts } };
}

/**
 * One input, as the outpoint it spends, leaving the reader after everything it declares.
 *
 * An input that issues an asset carries four more fields after its sequence, and Elements says
 * so in the top bits of the output index rather than in a field of its own. A reader that
 * stepped over a fixed width instead would work until the first transaction that hid an
 * issuance amount, and then it would not fail: it would read the next input's outpoint out of
 * the middle of this one.
 */
function readInput(reader: Reader): Outpoint | undefined {
	const txid = readReversedHex(reader, 32);
	const index = readUint32(reader);

	if (txid === undefined || index === undefined || !skipVector(reader)) {
		return undefined;
	}

	// The sequence.
	if (!skip(reader, 4)) {
		return undefined;
	}

	// A coinbase spends nothing and says so by writing an all-zero transaction and an index of
	// every bit set — which happens to include the issuance marker. Reading that as an issuance
	// walks sixty-four bytes into whatever follows and reports something well-formed and wrong,
	// so the null outpoint is checked before the marker means anything.
	const spendsNothing = index === NO_OUTPOINT && /^0*$/.test(txid);

	if (!spendsNothing && (index & ISSUANCE_FLAG) !== 0 && !skipIssuance(reader)) {
		return undefined;
	}

	return { txid, vout: index & OUTPOINT_INDEX };
}

/**
 * Walks past the issuance an input declares: two fixed fields and two confidential values.
 *
 * The two amounts are absent, explicit, or committed to — and nothing else. A prefix outside
 * that set is not a width to guess at: guessing puts the next input's outpoint somewhere in the
 * middle of this one, and what comes back is well-formed and about the wrong outputs.
 */
function skipIssuance(reader: Reader): boolean {
	// The blinding nonce and the entropy, both fixed.
	if (!skip(reader, 64)) {
		return false;
	}

	const amount = readField(reader, ISSUANCE_AMOUNT);
	const inflationKeys = readField(reader, ISSUANCE_AMOUNT);

	if (amount === undefined || inflationKeys === undefined) {
		return false;
	}

	// An input that sets the issuance flag and then declares neither an amount nor any
	// inflation keys has announced a record with nothing in it. Elements rejects that outright
	// rather than reading it as an issuance of nothing, and a reader that accepted it would be
	// reading a transaction the network will not take as one it will.
	return amount.form !== "null" || inflationKeys.form !== "null";
}

/**
 * The witness data, which Elements writes after the locktime and only when the marker says so.
 *
 * One per input — two range proofs and two stacks of byte strings — and one per output, being
 * a surjection proof and a range proof. None of it is read for what it says; all of it is
 * walked, because a transaction that announces witness data and then runs out part-way through
 * it is not a transaction, and a reader that stopped at the locktime would call it one.
 */
function skipWitnesses(reader: Reader, inputCount: number, outputCount: number): boolean {
	let carriesAnything = false;

	for (let index = 0; index < inputCount; index += 1) {
		// The issuance amount's range proof, the inflation keys' range proof, and then the
		// script witness and peg-in stacks.
		const proofs = [readVector(reader), readVector(reader)];
		const stacks = [readStack(reader), readStack(reader)];

		if ([...proofs, ...stacks].some((part) => part === undefined)) {
			return false;
		}

		carriesAnything ||= [...proofs, ...stacks].some((part) => part === true);
	}

	for (let index = 0; index < outputCount; index += 1) {
		const proofs = [readVector(reader), readVector(reader)];

		if (proofs.some((part) => part === undefined)) {
			return false;
		}

		carriesAnything ||= proofs.some((part) => part === true);
	}

	// A transaction that sets the marker and then writes a witness record with nothing in any
	// of its parts is one Elements rejects outright — the marker is what says the record is
	// there, and an empty record is the marker contradicting itself. Reading it as a
	// transaction with no witness would call something the network refuses a finished
	// transaction.
	return carriesAnything;
}

/** A counted run of byte strings, and whether the stack held anything at all. */
function readStack(reader: Reader): boolean | undefined {
	const count = readCount(reader);

	if (count === undefined) {
		return undefined;
	}

	for (let index = 0; index < count; index += 1) {
		if (readVector(reader) === undefined) {
			return undefined;
		}
	}

	// A stack of one empty item is still a stack that is there, which is what Elements counts.
	return count > 0;
}

/** One length-prefixed run of bytes, and whether it carried any. */
function readVector(reader: Reader): boolean | undefined {
	const length = readCount(reader);

	if (length === undefined || !skip(reader, length)) {
		return undefined;
	}

	return length > 0;
}

/** The same walk, where only reaching the end of it matters. */
function skipVector(reader: Reader): boolean {
	return readVector(reader) !== undefined;
}

/** One output, read from wherever the reader currently sits. */
function readOutput(reader: Reader): ParsedTxOut | undefined {
	const asset = readField(reader, OUTPUT_ASSET);
	const value = readField(reader, OUTPUT_VALUE);
	const nonce = readField(reader, OUTPUT_NONCE);
	const scriptLength = readCount(reader);

	if (
		asset === undefined ||
		value === undefined ||
		nonce === undefined ||
		scriptLength === undefined
	) {
		return undefined;
	}

	const scriptPubKeyHex = readHex(reader, scriptLength);

	if (scriptPubKeyHex === undefined) {
		return undefined;
	}

	return {
		// An asset id is written in reverse of how it is displayed, and every consumer here
		// wants the displayed form.
		...(asset.form === "explicit" ? { rawAssetId: reverseHex(asset.body) } : {}),
		...(value.form === "explicit" ? { amountSats: String(bigEndian(value.body)) } : {}),
		assetForm: asset.form,
		nonceForm: nonce.form,
		scriptPubKeyHex,
		valueForm: value.form,
	};
}

type Field = { body: string; form: FieldForm };

/**
 * What one of Elements' three-state fields may say, and how wide each answer is.
 *
 * The prefixes are not shared across fields, which is the whole reason this is a table rather
 * than a constant. `08`/`09` are the two parities a value commitment is written with, `0a`/`0b`
 * an asset's, and `02`/`03` a nonce's — the same byte means different things at different
 * positions and means nothing at all at most of them. A reader that accepted any byte as a
 * commitment would read a corrupt transaction as one full of hidden amounts, and a guard built
 * on that has been handed the one answer it cannot check.
 */
type FieldSpec = {
	/** Whether this field may say nothing at all, which `00` spells. */
	allowsNull: boolean;
	/** The parities a commitment at this position is written with. */
	commitments: number[];
	/** How many bytes the explicit form takes, or none where the field has no explicit form. */
	explicitLength?: number;
};

/** An asset: explicit and thirty-two bytes, or committed to. Never absent. */
const OUTPUT_ASSET: FieldSpec = {
	allowsNull: false,
	commitments: [0x0a, 0x0b],
	explicitLength: 32,
};
/** A value: explicit and eight bytes big-endian, or committed to. Never absent. */
const OUTPUT_VALUE: FieldSpec = { allowsNull: false, commitments: [0x08, 0x09], explicitLength: 8 };
/** A nonce: absent, or committed to. It has no explicit form. */
const OUTPUT_NONCE: FieldSpec = { allowsNull: true, commitments: [0x02, 0x03] };
/** An issuance amount: absent where nothing is issued, otherwise explicit or committed to. */
const ISSUANCE_AMOUNT: FieldSpec = {
	allowsNull: true,
	commitments: [0x08, 0x09],
	explicitLength: 8,
};

/** One field, read against exactly what the encoding permits at that position. */
function readField(reader: Reader, spec: FieldSpec): Field | undefined {
	const prefix = readUint8(reader);

	if (prefix === undefined) {
		return undefined;
	}

	if (prefix === 0x00) {
		return spec.allowsNull ? { body: "", form: "null" } : undefined;
	}

	if (prefix === 0x01 && spec.explicitLength !== undefined) {
		const body = readHex(reader, spec.explicitLength);

		return body === undefined ? undefined : { body, form: "explicit" };
	}

	if (!spec.commitments.includes(prefix)) {
		return undefined;
	}

	const body = readHex(reader, 32);

	return body === undefined ? undefined : { body, form: "commitment" };
}

/**
 * One compact-form count or length, as a number this runtime can actually act on.
 *
 * The canonical width is the part that decides answers: `fd 0a 00` and `0a` are the same
 * number and only the second is how the encoding writes it, and accepting both would make two
 * byte strings one transaction — exactly the latitude a guard comparing bytes cannot afford.
 *
 * The other two bound work rather than answers, and are kept for that reason rather than
 * because a test can tell them apart. A count that is not exactly representable, or that is
 * larger than the bytes left to satisfy it, is refused here — but every read it protects also
 * refuses a moment later, on the first byte that is not there. What they buy is that the
 * refusal is immediate instead of arriving after a loop has counted most of the way to two to
 * the sixty-fourth. Deleting them would not change what this function answers; it would change
 * how long it takes to answer.
 */
function readCount(reader: Reader): number | undefined {
	const value = readVarint(reader);

	if (value === undefined || value > BigInt(Number.MAX_SAFE_INTEGER)) {
		return undefined;
	}

	const count = Number(value);

	return count > reader.bytes.length - reader.at ? undefined : count;
}

function readVarint(reader: Reader): bigint | undefined {
	const first = readUint8(reader);

	if (first === undefined) {
		return undefined;
	}

	const widths: Record<number, { least: bigint; width: number }> = {
		0xfd: { least: 0xfdn, width: 2 },
		0xfe: { least: 0x1_0000n, width: 4 },
		0xff: { least: 0x1_0000_0000n, width: 8 },
	};
	const form = widths[first];

	if (form === undefined) {
		return BigInt(first);
	}

	const value = readUintLittleEndian(reader, form.width);

	return value === undefined || value < form.least ? undefined : value;
}

function readUintLittleEndian(reader: Reader, length: number): bigint | undefined {
	const body = readHex(reader, length);
	const bytes = body === undefined ? undefined : decodeHex(body);

	if (!bytes) {
		return undefined;
	}

	let value = 0n;

	for (let offset = bytes.length - 1; offset >= 0; offset -= 1) {
		value = value * 256n + BigInt(bytes[offset] ?? 0);
	}

	return value;
}

function reverseHex(hex: string): string {
	return (hex.match(/../g) ?? []).toReversed().join("");
}

function bigEndian(hex: string): bigint {
	const bytes = decodeHex(hex) ?? new Uint8Array();

	return readUintBigEndian({ at: 0, bytes }, bytes.length) ?? 0n;
}
