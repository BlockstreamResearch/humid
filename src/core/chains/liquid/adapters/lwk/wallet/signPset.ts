import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type {
	LiquidWalletAccount,
	LiquidWalletBackend,
} from "../../../application/backends/LiquidWalletBackend";
import { loadLwkWasm } from "../loadLwkWasm";
import { getLwkImplementation } from "./getLwkImplementation";

export async function signPset(
	account: LiquidWalletAccount,
	params: Parameters<LiquidWalletBackend["signPset"]>[1],
) {
	const implementation = getLwkImplementation(account);

	try {
		const lwk = await loadLwkWasm();
		const pset = new lwk.Pset(params.pset);
		const inputCount = pset.inputs().length;

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

		// The LWK signer signs every wallet-owned input, but ELIP-1 forbids signing inputs the dapp
		// did not list. Until lwk_wasm exposes per-input signing, fail closed: sign, then reject if
		// the wallet signed any input that was not requested (the PSET is never returned/broadcast).
		// TODO: Replace with requested-input-only signing once lwk_wasm exposes an input allowlist.
		const requestedIndexes = new Set(params.signInputs.map((requested) => requested.index));
		const signaturesBefore = countSignaturesPerInput(implementation.wollet.psetDetails(pset));

		let signedPset = implementation.signer.sign(pset);

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

		let txid: string | undefined;

		if (params.broadcast) {
			signedPset = implementation.wollet.finalize(signedPset);
			txid = (await implementation.blockchainClient.broadcast(signedPset)).toString();
		}

		return {
			pset: signedPset.toString(),
			txid,
		};
	} catch (error) {
		if (error instanceof WalletRpcResourceUnavailableError) {
			throw error;
		}

		throw new WalletRpcResourceUnavailableError(
			params.broadcast
				? "Could not sign and broadcast the Liquid PSET."
				: "Could not sign the Liquid PSET.",
			undefined,
			params.broadcast
				? WALLET_RPC_ERROR_REASONS.WALLET_PSET_BROADCAST_FAILED
				: WALLET_RPC_ERROR_REASONS.WALLET_PSET_SIGNING_FAILED,
		);
	}
}

/** Per PSET input, how many signatures the wallet sees present — used to detect over-signing. */
function countSignaturesPerInput(details: {
	signatures: () => Array<{ hasSignature: () => unknown }>;
}): number[] {
	return details.signatures().map((inputSignatures) => {
		const signatures = inputSignatures.hasSignature();

		return Array.isArray(signatures) ? signatures.length : 0;
	});
}
