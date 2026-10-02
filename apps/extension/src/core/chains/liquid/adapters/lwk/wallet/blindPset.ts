import { Buffer } from "buffer";

import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LwkWasmModule } from "../loadLwkWasm";
import { readExplicitWalletUtxos } from "./readExplicitWalletUtxos";

type Pset = InstanceType<LwkWasmModule["Pset"]>;
type Wollet = InstanceType<LwkWasmModule["Wollet"]>;

export function blindPset(lwk: LwkWasmModule, wollet: Wollet, pset: Pset): Pset {
	const inputs = pset.inputs();
	const outputs = pset.outputs();
	const transactionOutputs = pset.extractTx().outputs;
	const original = Buffer.from(pset.toString(), "base64");
	const reader = new PsetReader(original);
	const global = reader.map();
	const globalEnd = reader.offset;
	const inputMaps = inputs.map(() => reader.map());
	const outputMaps = outputs.map(() => reader.map());
	const targets = outputMaps.flatMap((map, index) => (map.has("fc047073657406") ? [index] : []));
	const pending = targets.filter(
		(index) =>
			transactionOutputs[index].asset() !== undefined ||
			transactionOutputs[index].value() !== undefined,
	);
	if (pending.length === 0) return pset;
	if (
		pending.length !== targets.length ||
		pending.some((index) => transactionOutputs[index].isPartiallyBlinded())
	) {
		throw invalid("Partially blinded PSETs must be completed by their original blinder.");
	}

	const owned = new Map(
		wollet.utxos().map((utxo) => {
			const outpoint = utxo.outpoint();
			return [`${outpoint.txid().toString()}:${outpoint.vout()}`, utxo] as const;
		}),
	);
	if (
		inputs.every((input) => owned.has(`${input.previousTxid().toString()}:${input.previousVout()}`))
	) {
		return wollet.blind(pset);
	}

	if ([...global.keys()].some((key) => key.startsWith("fc047073657400"))) {
		throw invalid("PSETs with existing blinding contributions are not supported.");
	}
	for (const map of inputMaps) {
		if ([...map.keys()].some((key) => ["02", "07", "08", "13", "14"].includes(key.slice(0, 2)))) {
			throw invalid("PSET must be blinded before signing or finalizing its inputs.");
		}
	}

	let walletTransactions: Map<string, ReturnType<Wollet["transactions"]>[number]> | undefined;
	let explicitWalletOutpoints: Set<string> | undefined;
	let hydrated = lwk.PsetBuilder.newV2();
	let needsHydration = false;
	for (const [index, input] of inputs.entries()) {
		if (inputMaps[index].has("01")) {
			hydrated = hydrated.addInput(input);
			continue;
		}
		const txid = input.previousTxid().toString();
		const vout = input.previousVout();
		const walletUtxo = owned.get(`${txid}:${vout}`);
		if (!walletUtxo) {
			explicitWalletOutpoints ??= new Set(
				readExplicitWalletUtxos(wollet)
					.filter((utxo) => utxo.spendable)
					.map((utxo) => `${utxo.txid}:${utxo.vout}`),
			);
			if (!explicitWalletOutpoints.has(`${txid}:${vout}`)) {
				throw invalid("Every input needs its witness UTXO before blinding.");
			}
		}
		walletTransactions ??= new Map(
			wollet.transactions().map((transaction) => [transaction.txid().toString(), transaction]),
		);
		const witnessUtxo = walletTransactions.get(txid)?.tx().outputs[vout];
		if (!witnessUtxo) throw invalid("Every input needs its witness UTXO before blinding.");
		hydrated = hydrated.addInput(
			lwk.PsetInputBuilder.fromPrevout(lwk.OutPoint.fromParts(input.previousTxid(), vout))
				.witnessUtxo(witnessUtxo)
				.build(),
		);
		needsHydration = true;
	}
	if (needsHydration) {
		for (const output of outputs) hydrated = hydrated.addOutput(output);
		const hydratedBytes = Buffer.from(hydrated.build().toString(), "base64");
		const hydratedReader = new PsetReader(hydratedBytes);
		hydratedReader.map();
		const prepared = new lwk.Pset(
			Buffer.concat([
				original.subarray(0, globalEnd),
				hydratedBytes.subarray(hydratedReader.offset),
			]).toString("base64"),
		);
		prepared.combine(pset);
		return blindPset(lwk, wollet, prepared);
	}

	const secrets = inputs.map((input, index) => {
		const witnessUtxo = inputMaps[index].get("01")!;
		const walletUtxo = owned.get(`${input.previousTxid().toString()}:${input.previousVout()}`);
		if (walletUtxo) return walletUtxo.unblinded();
		if (witnessUtxo.length < 43 || witnessUtxo[0] !== 1 || witnessUtxo[33] !== 1) {
			throw invalid("Cannot blind a foreign confidential input without its blinding secrets.");
		}
		const asset = lwk.AssetId.fromString(
			Buffer.from(witnessUtxo.subarray(1, 33)).reverse().toString("hex"),
		);
		return lwk.TxOutSecrets.fromExplicit(asset, witnessUtxo.readBigUInt64BE(34));
	});
	let builder = lwk.PsetBuilder.newV2();
	for (const input of inputs) builder = builder.addInput(input);
	for (const output of outputs) builder = builder.addOutput(output);
	const blinded = builder
		.blindLast(Uint32Array.from(inputs.map((_, index) => index)), secrets)
		.build();
	const result = Buffer.from(blinded.toString(), "base64");
	const resultReader = new PsetReader(result);
	resultReader.map();
	const prepared = new lwk.Pset(
		Buffer.concat([original.subarray(0, globalEnd), result.subarray(resultReader.offset)]).toString(
			"base64",
		),
	);
	prepared.addDetails(wollet);
	return prepared;
}

function invalid(message: string) {
	return new WalletRpcResourceUnavailableError(
		message,
		undefined,
		WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST,
	);
}

export class PsetReader {
	offset = 5;

	constructor(private readonly bytes: Buffer) {
		if (!bytes.subarray(0, 5).equals(Buffer.from("70736574ff", "hex")))
			throw invalid("Invalid PSET header.");
	}

	map(): Map<string, Buffer> {
		const entries = new Map<string, Buffer>();
		for (let length = this.compactSize(); length !== 0; length = this.compactSize()) {
			const key = this.take(length).toString("hex");
			entries.set(key, this.take(this.compactSize()));
		}
		return entries;
	}

	private take(length: number): Buffer {
		if (length > this.bytes.length - this.offset) throw invalid("Truncated PSET map.");
		const result = this.bytes.subarray(this.offset, this.offset + length);
		this.offset += length;
		return result;
	}

	private compactSize(): number {
		const prefix = this.take(1)[0];
		if (prefix < 253) return prefix;
		const bytes = this.take(prefix === 253 ? 2 : prefix === 254 ? 4 : 8);
		const value =
			prefix === 253
				? BigInt(bytes.readUInt16LE())
				: prefix === 254
					? BigInt(bytes.readUInt32LE())
					: bytes.readBigUInt64LE();
		if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw invalid("PSET map length is too large.");
		return Number(value);
	}
}
