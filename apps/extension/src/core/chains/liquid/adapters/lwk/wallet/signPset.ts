import type { Pset, PsetDetails } from "lwk_wasm";

import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type {
	LiquidWalletAccount,
	LiquidWalletBackend,
} from "../../../application/backends/LiquidWalletBackend";
import { loadLwkWasm } from "../loadLwkWasm";
import { getSyncWorkerClient } from "../sync-worker/createSyncWorkerClient";
import { getLwkImplementation } from "./getLwkImplementation";

export async function signPset(
	account: LiquidWalletAccount,
	params: Parameters<LiquidWalletBackend["signPset"]>[1],
) {
	const implementation = getLwkImplementation(account);

	try {
		const lwk = await loadLwkWasm();
		let pset: Pset | undefined = new lwk.Pset(params.preparedPset);
		try {
			const inputs = pset.inputs();
			const inputCount = inputs.length;
			for (const input of inputs) input.free();

			for (const input of params.signInputs) {
				if (input.index >= inputCount) {
					throw new WalletRpcResourceUnavailableError(
						"Requested PSET input index is out of range.",
						{ inputCount, requestedIndex: input.index },
						WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST,
					);
				}
			}

			const requestedIndexes = new Set(params.signInputs.map((requested) => requested.index));
			const signaturesBefore = countSignaturesPerInput(implementation.wollet.psetDetails(pset));
			const signingPset = pset;
			// signer.sign consumes the input PSET, including on failure.
			pset = undefined;
			let signedPset: Pset | undefined = implementation.signer.sign(signingPset);

			try {
				const overSignedIndex = countSignaturesPerInput(
					implementation.wollet.psetDetails(signedPset),
				).findIndex(
					(count, index) => count > (signaturesBefore[index] ?? 0) && !requestedIndexes.has(index),
				);

				if (overSignedIndex !== -1) {
					throw new WalletRpcResourceUnavailableError(
						"Refusing to sign a Liquid PSET input the request did not list.",
						{
							overSignedInputIndex: overSignedIndex,
							requestedInputIndexes: [...requestedIndexes],
						},
						WALLET_RPC_ERROR_REASONS.INVALID_PSET_REQUEST,
					);
				}

				if (params.broadcast) {
					const finalizingPset = signedPset;
					// wollet.finalize also transfers ownership to WASM.
					signedPset = undefined;
					const finalizedPset = implementation.wollet.finalize(finalizingPset);
					try {
						const broadcast = await getSyncWorkerClient().broadcast({
							chain: account.chain,
							psetBase64: finalizedPset.toString(),
						});
						return { pset: finalizedPset.toString(), txid: broadcast.txid };
					} finally {
						finalizedPset.free();
					}
				}

				return { pset: signedPset.toString() };
			} finally {
				signedPset?.free();
			}
		} finally {
			pset?.free();
		}
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
	}
}

function countSignaturesPerInput(details: PsetDetails): number[] {
	try {
		const inputs = details.signatures();
		try {
			return inputs.map((inputSignatures) => {
				const signatures: unknown = inputSignatures.hasSignature();
				return Array.isArray(signatures) ? signatures.length : 0;
			});
		} finally {
			for (const input of inputs) input.free();
		}
	} finally {
		details.free();
	}
}
