import {
	decodeHex,
	encodeHex,
	type Reader,
	readHex,
	readReversedHex,
	readUint8,
	readUint32,
	readUintBigEndian,
	skip,
} from "./bytes";
import type { Outpoint } from "./outpoint";

const ISSUANCE_FLAG = 0x80_00_00_00;
const OUTPOINT_INDEX = 0x3f_ff_ff_ff;

const NO_OUTPOINT = 0xff_ff_ff_ff;

const WITNESS_PRESENT = 0x01;

type FieldForm = "commitment" | "explicit" | "null";

type ParsedTxOut = {
	amountSats?: string;
	assetForm: FieldForm;
	nonceForm: FieldForm;
	rawAssetId?: string;
	scriptPubKeyHex: string;
	txOutHex: string;
	valueForm: FieldForm;
};

type ParsedTransaction = { spent: Outpoint[]; txOuts: ParsedTxOut[] };

type ParseResult = { ok: false; reason: string } | { ok: true; transaction: ParsedTransaction };

type TxOutAt = { ok: false; reason: string } | { ok: true; txOut: ParsedTxOut };

export function txOutAt(transactionHex: string, vout: number): TxOutAt {
	if (!Number.isInteger(vout) || vout < 0) {
		return { ok: false, reason: `${vout} is not an output index.` };
	}

	const parsed = parseTransaction(transactionHex);

	if (!parsed.ok) {
		return parsed;
	}

	const txOut = parsed.transaction.txOuts[vout];

	return txOut === undefined
		? {
				ok: false,
				reason: `The transaction carries ${parsed.transaction.txOuts.length} outputs, so there is none at ${vout}.`,
			}
		: { ok: true, txOut };
}

function parseTransaction(transactionHex: string): ParseResult {
	const bytes = decodeHex(transactionHex);

	if (!bytes) {
		return { ok: false, reason: "The signed transaction is not hex." };
	}

	const reader: Reader = { at: 0, bytes };

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

	if (reader.at !== bytes.length) {
		return {
			ok: false,
			reason: `The signed transaction carries ${bytes.length - reader.at} bytes after the end of it.`,
		};
	}

	return { ok: true, transaction: { spent, txOuts } };
}

function readInput(reader: Reader): Outpoint | undefined {
	const txid = readReversedHex(reader, 32);
	const index = readUint32(reader);

	if (txid === undefined || index === undefined || !skipVector(reader)) {
		return undefined;
	}

	if (!skip(reader, 4)) {
		return undefined;
	}

	const spendsNothing = index === NO_OUTPOINT && /^0*$/.test(txid);

	if (!spendsNothing && (index & ISSUANCE_FLAG) !== 0 && !skipIssuance(reader)) {
		return undefined;
	}

	return { txid, vout: index & OUTPOINT_INDEX };
}

function skipIssuance(reader: Reader): boolean {
	if (!skip(reader, 64)) {
		return false;
	}

	const amount = readField(reader, ISSUANCE_AMOUNT);
	const inflationKeys = readField(reader, ISSUANCE_AMOUNT);

	if (amount === undefined || inflationKeys === undefined) {
		return false;
	}

	return amount.form !== "null" || inflationKeys.form !== "null";
}

function skipWitnesses(reader: Reader, inputCount: number, outputCount: number): boolean {
	let carriesAnything = false;

	for (let index = 0; index < inputCount; index += 1) {
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

	return carriesAnything;
}

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

	return count > 0;
}

function readVector(reader: Reader): boolean | undefined {
	const length = readCount(reader);

	if (length === undefined || !skip(reader, length)) {
		return undefined;
	}

	return length > 0;
}

function skipVector(reader: Reader): boolean {
	return readVector(reader) !== undefined;
}

function readOutput(reader: Reader): ParsedTxOut | undefined {
	const from = reader.at;
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
		...(asset.form === "explicit" ? { rawAssetId: reverseHex(asset.body) } : {}),
		...(value.form === "explicit" ? { amountSats: String(bigEndian(value.body)) } : {}),
		assetForm: asset.form,
		nonceForm: nonce.form,
		scriptPubKeyHex,
		txOutHex: encodeHex(reader.bytes.subarray(from, reader.at)),
		valueForm: value.form,
	};
}

type Field = { body: string; form: FieldForm };

type FieldSpec = {
	allowsNull: boolean;
	commitments: number[];
	explicitLength?: number;
};

const OUTPUT_ASSET: FieldSpec = {
	allowsNull: false,
	commitments: [0x0a, 0x0b],
	explicitLength: 32,
};
const OUTPUT_VALUE: FieldSpec = { allowsNull: false, commitments: [0x08, 0x09], explicitLength: 8 };
const OUTPUT_NONCE: FieldSpec = { allowsNull: true, commitments: [0x02, 0x03] };
const ISSUANCE_AMOUNT: FieldSpec = {
	allowsNull: true,
	commitments: [0x08, 0x09],
	explicitLength: 8,
};

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
