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

		// TODO: Replace generic LWK signing with requested-input-only signing once lwk_wasm
		// exposes an input allowlist or lower-level signer API.
		let signedPset = implementation.signer.sign(pset);
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
