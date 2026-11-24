import { Buffer } from "buffer";

import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

type Entries = Map<string, Buffer>;

const HEADER = Buffer.from("70736574ff", "hex");
const ELEMENTS = "fc0470736574";
const BLINDING_CONTRIBUTION = `${ELEMENTS}00`;
const VALUE_COMMITMENT = `${ELEMENTS}01`;
const ASSET_COMMITMENT = `${ELEMENTS}03`;
const BLINDING_PUBKEY = `${ELEMENTS}06`;
const BLINDER_INDEX = `${ELEMENTS}08`;
const ISSUANCE_VALUE = `${ELEMENTS}00`;
const ISSUANCE_VALUE_COMMITMENT = `${ELEMENTS}01`;
const ISSUANCE_TOKENS = `${ELEMENTS}0a`;
const ISSUANCE_TOKENS_COMMITMENT = `${ELEMENTS}0b`;

const INPUT_COUNT = "04";
const OUTPUT_COUNT = "05";
const WITNESS_UTXO = "01";
const PREVIOUS_TXID = "0e";
const PREVIOUS_VOUT = "0f";
const SIGNATURES = ["02", "13", "14"];
const FINALIZED = ["07", "08"];

export function invalidPset(message: string) {
	return new WalletRpcResourceUnavailableError(
		message,
		undefined,
		WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST,
	);
}

abstract class PsetEntries {
	constructor(
		readonly entries: Entries,
		private readonly derivations: readonly string[],
	) {}

	get isOwned(): boolean {
		return this.ofType(this.derivations).length > 0;
	}

	disown(): void {
		for (const key of this.ofType(this.derivations)) this.entries.delete(key);
	}

	protected ofType(types: readonly string[]): string[] {
		return [...this.entries.keys()].filter((key) => types.includes(key.slice(0, 2)));
	}
}

export class InputEntries extends PsetEntries {
	constructor(entries: Entries) {
		super(entries, ["06", "16"]);
	}

	get outpoint(): string {
		const txid = this.entries.get(PREVIOUS_TXID);
		const vout = this.entries.get(PREVIOUS_VOUT);
		if (txid?.length !== 32 || vout?.length !== 4)
			throw invalidPset("PSET input lacks its outpoint.");
		return `${Buffer.from(txid.toReversed()).toString("hex")}:${vout.readUInt32LE()}`;
	}

	get hasWitnessUtxo(): boolean {
		return this.entries.has(WITNESS_UTXO);
	}

	get explicitPrevout(): { asset: string; value: bigint } | undefined {
		const utxo = this.entries.get(WITNESS_UTXO);
		if (!utxo || utxo.length < 44 || utxo[0] !== 1 || utxo[33] !== 1 || utxo[42] !== 0) return;
		return {
			asset: Buffer.from(utxo.subarray(1, 33).toReversed()).toString("hex"),
			value: utxo.readBigUInt64BE(34),
		};
	}

	get signatures(): Entries {
		return new Map(this.ofType(SIGNATURES).map((key) => [key, this.entries.get(key)!]));
	}

	get isSigned(): boolean {
		return this.ofType([...SIGNATURES, ...FINALIZED]).length > 0;
	}

	spend(txOutHex: string): void {
		this.entries.set(WITNESS_UTXO, Buffer.from(txOutHex, "hex"));
	}

	/** Explicit issuance amounts; a blinded or missing one is undefined, since nothing proves the amount. */
	get issued(): { amount?: bigint; tokens?: bigint } {
		return {
			amount: this.#explicitAmount(ISSUANCE_VALUE, ISSUANCE_VALUE_COMMITMENT),
			tokens: this.#explicitAmount(ISSUANCE_TOKENS, ISSUANCE_TOKENS_COMMITMENT),
		};
	}

	#explicitAmount(key: string, commitment: string): bigint | undefined {
		const value = this.entries.get(key);
		return value?.length === 8 && !this.entries.has(commitment)
			? value.readBigUInt64LE()
			: undefined;
	}

	adoptSignatures(from: InputEntries): void {
		for (const [key, signature] of from.signatures) this.entries.set(key, signature);
	}
}

export class OutputEntries extends PsetEntries {
	constructor(entries: Entries) {
		super(entries, ["02", "07"]);
	}

	get isBlindingTarget(): boolean {
		return this.entries.has(BLINDING_PUBKEY);
	}

	get isBlinded(): boolean {
		return this.entries.has(VALUE_COMMITMENT) && this.entries.has(ASSET_COMMITMENT);
	}

	get isExplicit(): boolean {
		return !this.entries.has(VALUE_COMMITMENT) && !this.entries.has(ASSET_COMMITMENT);
	}

	assignBlinder(): void {
		if (!this.entries.has(BLINDER_INDEX)) this.entries.set(BLINDER_INDEX, Buffer.alloc(4));
	}
}

export class PsetMaps {
	private constructor(
		readonly global: Entries,
		readonly inputs: InputEntries[],
		readonly outputs: OutputEntries[],
	) {}

	static parse(base64: string): PsetMaps {
		const bytes = Buffer.from(base64, "base64");
		if (!bytes.subarray(0, HEADER.length).equals(HEADER)) throw invalidPset("Invalid PSET header.");
		const reader = new Reader(bytes, HEADER.length);
		const global = reader.map();
		const count = (key: string) => new Reader(global.get(key) ?? Buffer.alloc(1), 0).compactSize();
		const inputs = Array.from({ length: count(INPUT_COUNT) }, () => new InputEntries(reader.map()));
		const outputs = Array.from(
			{ length: count(OUTPUT_COUNT) },
			() => new OutputEntries(reader.map()),
		);
		if (!reader.done) throw invalidPset("Unexpected trailing PSET data.");
		return new PsetMaps(global, inputs, outputs);
	}

	get hasBlindingContributions(): boolean {
		return [...this.global.keys()].some((key) => key.startsWith(BLINDING_CONTRIBUTION));
	}

	withOutputsOf(other: PsetMaps): PsetMaps {
		return new PsetMaps(this.global, this.inputs, other.outputs);
	}

	toString(): string {
		const buffers: Buffer[] = [HEADER];
		for (const map of [this.global, ...[...this.inputs, ...this.outputs].map((m) => m.entries)]) {
			for (const [key, value] of map) {
				const keyBytes = Buffer.from(key, "hex");
				buffers.push(compactSize(keyBytes.length), keyBytes, compactSize(value.length), value);
			}
			buffers.push(Buffer.alloc(1));
		}
		return Buffer.concat(buffers).toString("base64");
	}
}

function compactSize(length: number): Buffer {
	if (length < 253) return Buffer.from([length]);
	const encoded = Buffer.alloc(length <= 0xffff ? 3 : 5);
	encoded[0] = encoded.length === 3 ? 253 : 254;
	if (encoded.length === 3) encoded.writeUInt16LE(length, 1);
	else encoded.writeUInt32LE(length, 1);
	return encoded;
}

class Reader {
	constructor(
		private readonly bytes: Buffer,
		private offset: number,
	) {}

	get done(): boolean {
		return this.offset === this.bytes.length;
	}

	map(): Entries {
		const entries: Entries = new Map();
		for (let length = this.compactSize(); length !== 0; length = this.compactSize()) {
			const key = this.take(length).toString("hex");
			entries.set(key, this.take(this.compactSize()));
		}
		return entries;
	}

	compactSize(): number {
		const prefix = this.take(1)[0]!;
		if (prefix < 253) return prefix;
		const bytes = this.take(prefix === 253 ? 2 : prefix === 254 ? 4 : 8);
		const value =
			prefix === 253
				? BigInt(bytes.readUInt16LE())
				: prefix === 254
					? BigInt(bytes.readUInt32LE())
					: bytes.readBigUInt64LE();
		if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw invalidPset("PSET map length is too large.");
		return Number(value);
	}

	private take(length: number): Buffer {
		if (length > this.bytes.length - this.offset) throw invalidPset("Truncated PSET map.");
		const result = this.bytes.subarray(this.offset, this.offset + length);
		this.offset += length;
		return result;
	}
}
