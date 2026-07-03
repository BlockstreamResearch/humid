import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcInvalidParamsError,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import {
	LIQUID_SIGN_MESSAGE_PROTOCOLS,
	LIQUID_SIGN_MESSAGE_SIGNATURE_ENCODINGS,
	type LiquidSignMessageResult,
	type LiquidSignMessageReview,
	type ParsedLiquidSignMessageParams,
} from "../../../domain/message/types";
import { loadLwkWasm } from "../loadLwkWasm";
import { getLwkImplementation } from "./getLwkImplementation";

const SIGN_MESSAGE_ADDRESS_SCAN_LIMIT = 1000;

export async function inspectMessageSigning(
	account: LiquidWalletAccount,
	params: ParsedLiquidSignMessageParams,
): Promise<LiquidSignMessageReview> {
	const { address } = await resolveMessageSigningPath(account, params);

	return {
		accountIdentifier: account.accountIdentifier,
		address,
		chainId: account.chainId,
		protocol: params.protocol,
	};
}

export async function signMessage(
	account: LiquidWalletAccount,
	params: ParsedLiquidSignMessageParams,
): Promise<LiquidSignMessageResult> {
	if (params.protocol !== LIQUID_SIGN_MESSAGE_PROTOCOLS.ECDSA) {
		throw new WalletRpcInvalidParamsError(
			"Unsupported Liquid message signing protocol.",
			{
				protocol: params.protocol,
				supportedProtocols: [LIQUID_SIGN_MESSAGE_PROTOCOLS.ECDSA],
			},
			WALLET_RPC_ERROR_REASONS.UNSUPPORTED_MESSAGE_SIGNING_PROTOCOL,
		);
	}

	const { address, path } = await resolveMessageSigningPath(account, params);
	const implementation = getLwkImplementation(account);

	try {
		const signedMessage = implementation.signer.signMessageAtPath(params.message, path);

		return {
			address,
			messageHash: signedMessage.messageHash,
			protocol: LIQUID_SIGN_MESSAGE_PROTOCOLS.ECDSA,
			signature: signedMessage.signature,
			signatureEncoding: LIQUID_SIGN_MESSAGE_SIGNATURE_ENCODINGS.HEX_RECOVERABLE_ECDSA_65,
		};
	} catch {
		throw new WalletRpcResourceUnavailableError(
			"Could not sign the Liquid message.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_MESSAGE_SIGNING_FAILED,
		);
	}
}

async function resolveMessageSigningPath(
	account: LiquidWalletAccount,
	params: ParsedLiquidSignMessageParams,
): Promise<{ address: string; path: Uint32Array }> {
	const lwk = await loadLwkWasm();
	const implementation = getLwkImplementation(account);

	try {
		const address = lwk.Address.parse(params.address, implementation.network);
		const path = implementation.wollet.addressFullPathFor(address, SIGN_MESSAGE_ADDRESS_SCAN_LIMIT);

		return {
			address: address.toString(),
			path,
		};
	} catch {
		throw new WalletRpcInvalidParamsError(
			"Liquid message signing address is invalid or does not belong to the connected wallet.",
			{
				address: params.address,
				scannedAddressIndexes: SIGN_MESSAGE_ADDRESS_SCAN_LIMIT + 1,
			},
			WALLET_RPC_ERROR_REASONS.INVALID_MESSAGE_SIGNING_REQUEST,
		);
	}
}
