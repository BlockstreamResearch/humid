import { Buffer } from "buffer";

import type { Pset, PsetBalance, Wollet } from "lwk_wasm";

import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type {
	LiquidWalletAccount,
	LiquidWalletBackend,
} from "../../../application/backends/LiquidWalletBackend";
import type { LiquidSignPsetReview } from "../../../domain/pset/types";
import { type LwkWasmModule, loadLwkWasm } from "../loadLwkWasm";
import { getSyncWorkerClient } from "../sync-worker/createSyncWorkerClient";
import { blindPset, PsetReader } from "./blindPset";
import { getLwkImplementation } from "./getLwkImplementation";

export async function blindAndInspectPset(
	account: LiquidWalletAccount,
	psetBase64: string,
): Promise<LiquidSignPsetReview> {
	const lwk = await loadLwkWasm();
	const { wollet } = getLwkImplementation(account);
	const pset = new lwk.Pset(psetBase64);
	let blindedPset: Pset | undefined;
	try {
		pset.addDetails(wollet);
		blindedPset = blindPset(lwk, wollet, pset);
		return inspectPset(lwk, wollet, blindedPset);
	} finally {
		if (blindedPset !== pset) blindedPset?.free();
		pset.free();
	}
}

function inspectPset(lwk: LwkWasmModule, wollet: Wollet, pset: Pset): LiquidSignPsetReview {
	const resources: { free(): void }[] = [];
	const own = <T extends { free(): void }>(value: T): T => {
		resources.push(value);
		return value;
	};
	try {
		const inputs = pset.inputs();
		inputs.forEach(own);
		const outputs = pset.outputs();
		outputs.forEach(own);
		const projection = readPsetMaps(pset);
		const explicitBalances = new Map<string, bigint>();
		const addExplicit = (asset: string, amount: bigint) => {
			explicitBalances.set(asset, (explicitBalances.get(asset) ?? 0n) + amount);
		};
		let balance: PsetBalance | undefined;
		for (let attempt = 0; attempt <= inputs.length + outputs.length; attempt++) {
			const inspection = new lwk.Pset(writePsetMaps(projection));
			try {
				balance = own(own(wollet.psetDetails(inspection)).balance());
				break;
			} catch (error) {
				const match = /^(Input|Output) #(\d+) is not blinded$/.exec(
					typeof error === "object" &&
						error !== null &&
						"message" in error &&
						typeof error.message === "string"
						? error.message
						: "",
				);
				if (!match) throw error;
				const index = Number(match[2]);
				const isInput = match[1] === "Input";
				const map = (isInput ? projection.inputs : projection.outputs)[index];
				if (!map) throw error;
				const derivations = [...map.keys()].filter((key) =>
					(isInput ? ["06", "16"] : ["02", "07"]).includes(key.slice(0, 2)),
				);
				if (!derivations.length) throw error;
				if (isInput) {
					const utxo = map.get("01");
					if (!utxo || utxo.length < 44 || utxo[0] !== 1 || utxo[33] !== 1 || utxo[42] !== 0)
						throw error;
					addExplicit(
						Buffer.from(utxo.subarray(1, 33)).reverse().toString("hex"),
						-utxo.readBigUInt64BE(34),
					);
				} else {
					if (
						[1, 3, 4, 5, 6, 7, 9, 10].some((field) =>
							map.has(`fc0470736574${field.toString(16).padStart(2, "0")}`),
						)
					)
						throw error;
					const amount = outputs[index]!.amount();
					const asset = outputs[index]!.asset();
					if (amount === undefined || !asset) throw error;
					addExplicit(own(asset).toString(), amount);
				}
				for (const key of derivations) map.delete(key);
			} finally {
				inspection.free();
			}
		}
		if (!balance) throw new Error("Could not inspect the Liquid PSET.");
		const fees = own(balance.fees());
		const balances = own(balance.balances());
		const netBalances = new Map(balances.entries() as Map<string, bigint>);
		for (const [asset, amount] of explicitBalances) {
			netBalances.set(asset, (netBalances.get(asset) ?? 0n) + amount);
		}
		const addresses = new Map<number, string>();
		const recipients = balance.recipients();
		recipients.forEach(own);
		for (const recipient of recipients) {
			const address = recipient.address();
			if (address) addresses.set(recipient.vout(), own(address).toString());
		}
		return {
			pset: pset.toString(),
			inputs: inputs.map((input, index) => ({
				index,
				sighashType: input.sighash(),
			})),
			fees: Array.from(fees.entries() as Map<string, bigint>, ([asset, amount]) => ({
				asset,
				amount: amount.toString(),
			})),
			netEffect: Array.from(netBalances, ([asset, amount]) => ({
				asset,
				amount: amount.toString(),
			})).filter((entry) => entry.amount !== "0"),
			outputs: outputs.map((output, index) => {
				const value = output.asset();
				const asset = value ? own(value) : undefined;
				return {
					address: addresses.get(index),
					amount: output.amount()?.toString(),
					asset: asset?.toString(),
					index,
					script: own(output.scriptPubkey()).toString(),
				};
			}),
		};
	} finally {
		for (let i = resources.length - 1; i >= 0; i--) resources[i]!.free();
	}
}

export async function signPset(
	account: LiquidWalletAccount,
	params: Parameters<LiquidWalletBackend["signPset"]>[1],
) {
	const implementation = getLwkImplementation(account);
	let pset: Pset | undefined;
	try {
		const lwk = await loadLwkWasm();
		pset = new lwk.Pset(params.reviewedPset);
		const inputs = pset.inputs();
		const inputCount = inputs.length;
		for (const input of inputs) input.free();

		for (const input of params.signInputs) {
			if (input.index >= inputCount) {
				throw new WalletRpcResourceUnavailableError(
					"Requested PSET input index is out of range.",
					{
						inputCount,
						requestedIndex: input.index,
					},
					WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST,
				);
			}
		}

		const requestedIndexes = new Set(params.signInputs.map((requested) => requested.index));
		const signaturesBefore = readInputSignatures(pset);

		// sign and finalize consume their input, including when they throw.
		const signingPset = pset;
		pset = undefined;
		pset = implementation.signer.sign(signingPset);

		const overSignedInputIndex = readInputSignatures(pset).findIndex(
			(signatures, index) =>
				!requestedIndexes.has(index) &&
				[...signatures].some(([key, value]) => !signaturesBefore[index].get(key)?.equals(value)),
		);
		if (overSignedInputIndex !== -1) {
			throw new WalletRpcResourceUnavailableError(
				"Refusing to sign a Liquid PSET input the request did not list.",
				{
					overSignedInputIndex,
					requestedInputIndexes: [...requestedIndexes],
				},
				WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST,
			);
		}

		let txid: string | undefined;

		if (params.broadcast) {
			const finalizingPset = pset;
			pset = undefined;
			pset = implementation.wollet.finalize(finalizingPset);
			const broadcast = await getSyncWorkerClient().broadcast({
				chain: account.chain,
				psetBase64: pset.toString(),
			});
			txid = broadcast.txid;
		}

		return {
			pset: pset.toString(),
			txid,
		};
	} catch (error) {
		if (error instanceof WalletRpcResourceUnavailableError) {
			throw error;
		}

		console.error("[liquid] signPset failed", error);

		const failure = new WalletRpcResourceUnavailableError(
			params.broadcast
				? "Could not sign and broadcast the Liquid PSET."
				: "Could not sign the Liquid PSET.",
			undefined,
			params.broadcast
				? WALLET_RPC_ERROR_REASONS.WALLET_PSET_BROADCAST_FAILED
				: WALLET_RPC_ERROR_REASONS.WALLET_PSET_SIGNING_FAILED,
		);
		failure.cause = error;
		throw failure;
	} finally {
		pset?.free();
	}
}

function readInputSignatures(pset: Pset) {
	const reader = new PsetReader(Buffer.from(pset.toString(), "base64"));
	reader.map();
	const inputs = pset.inputs();
	try {
		return inputs.map(
			() =>
				new Map(
					[...reader.map().entries()].filter(([key]) =>
						["02", "13", "14"].includes(key.slice(0, 2)),
					),
				),
		);
	} finally {
		for (const input of inputs) input.free();
	}
}

type PsetMaps = {
	global: Map<string, Buffer>;
	inputs: Map<string, Buffer>[];
	outputs: Map<string, Buffer>[];
};

function readPsetMaps(pset: Pset): PsetMaps {
	const bytes = Buffer.from(pset.toString(), "base64");
	const reader = new PsetReader(bytes);
	const inputs = pset.inputs();
	const outputs = pset.outputs();
	try {
		const maps = {
			global: reader.map(),
			inputs: inputs.map(() => reader.map()),
			outputs: outputs.map(() => reader.map()),
		};
		if (reader.offset !== bytes.length) throw new Error("Unexpected trailing PSET data.");
		return maps;
	} finally {
		for (const input of inputs) input.free();
		for (const output of outputs) output.free();
	}
}

function writePsetMaps(maps: PsetMaps): string {
	const compactSize = (length: number): Buffer => {
		if (length < 253) return Buffer.from([length]);
		const encoded = Buffer.alloc(length <= 0xffff ? 3 : 5);
		encoded[0] = encoded.length === 3 ? 253 : 254;
		if (encoded.length === 3) encoded.writeUInt16LE(length, 1);
		else encoded.writeUInt32LE(length, 1);
		return encoded;
	};
	const buffers: Buffer[] = [Buffer.from("70736574ff", "hex")];
	for (const map of [maps.global, ...maps.inputs, ...maps.outputs]) {
		for (const [key, value] of map) {
			const keyBytes = Buffer.from(key, "hex");
			buffers.push(compactSize(keyBytes.length), keyBytes, compactSize(value.length), value);
		}
		buffers.push(Buffer.alloc(1));
	}
	return Buffer.concat(buffers).toString("base64");
}
