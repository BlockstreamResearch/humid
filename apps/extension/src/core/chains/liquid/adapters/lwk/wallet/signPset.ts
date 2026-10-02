import { Buffer } from "buffer";

import type { Pset, Wollet } from "lwk_wasm";

import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type {
	LiquidWalletAccount,
	LiquidWalletBackend,
} from "../../../application/backends/LiquidWalletBackend";
import type { LiquidSignPsetReview } from "../../../domain/pset/types";
import { loadLwkWasm } from "../loadLwkWasm";
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
		blindedPset = blindPset(lwk, wollet, pset);
		return inspectPset(wollet, blindedPset);
	} finally {
		if (blindedPset !== pset) blindedPset?.free();
		pset.free();
	}
}

function inspectPset(wollet: Wollet, pset: Pset): LiquidSignPsetReview {
	const resources: { free(): void }[] = [];
	const own = <T extends { free(): void }>(value: T): T => {
		resources.push(value);
		return value;
	};
	try {
		const inputs = pset.inputs();
		inputs.forEach(own);
		const balance = own(own(wollet.psetDetails(pset)).balance());
		const fees = own(balance.fees());
		const balances = own(balance.balances());
		const addresses = new Map<number, string>();
		const recipients = balance.recipients();
		recipients.forEach(own);
		for (const recipient of recipients) {
			const address = recipient.address();
			if (address) addresses.set(recipient.vout(), own(address).toString());
		}
		const outputs = pset.outputs();
		outputs.forEach(own);
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
			netEffect: Array.from(balances.entries() as Map<string, bigint>, ([asset, amount]) => ({
				asset,
				amount: amount.toString(),
			})),
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
