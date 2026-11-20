import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import type { DerivationPath, Wollet } from "lwk_wasm";

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
		const signature = Uint8Array.from(
			atob(implementation.signer.signMessage(params.message, path)),
			(char) => char.charCodeAt(0),
		);
		const recoveryId = (signature[0]! - 27) & 3;

		return {
			address,
			messageHash: bytesToHex(signedMessageHash(params.message)),
			protocol: LIQUID_SIGN_MESSAGE_PROTOCOLS.ECDSA,
			signature: bytesToHex(concatBytes(signature.subarray(1), Uint8Array.of(recoveryId))),
			signatureEncoding: LIQUID_SIGN_MESSAGE_SIGNATURE_ENCODINGS.HEX_RECOVERABLE_ECDSA_65,
		};
	} catch {
		throw new WalletRpcResourceUnavailableError(
			"Could not sign the Liquid message.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_MESSAGE_SIGNING_FAILED,
		);
	} finally {
		path.free();
	}
}

async function resolveMessageSigningPath(
	account: LiquidWalletAccount,
	params: ParsedLiquidSignMessageParams,
): Promise<{ address: string; path: DerivationPath }> {
	const lwk = await loadLwkWasm();
	const implementation = getLwkImplementation(account);

	try {
		const address = lwk.Address.parse(params.address, implementation.network);

		try {
			return {
				address: address.toString(),
				path: findDerivationPath(implementation.wollet, address.scriptPubkey().toString()),
			};
		} finally {
			address.free();
		}
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

function findDerivationPath(wollet: Wollet, script: string): DerivationPath {
	for (const derive of [wollet.address.bind(wollet), wollet.change.bind(wollet)]) {
		for (let index = 0; index <= SIGN_MESSAGE_ADDRESS_SCAN_LIMIT; index++) {
			const derived = derive(index);
			const address = derived.address();
			const scriptPubkey = address.scriptPubkey();

			try {
				if (scriptPubkey.toString() === script) {
					const path = derived.derivationPath();

					if (path) return path;
				}
			} finally {
				scriptPubkey.free();
				address.free();
				derived.free();
			}
		}
	}

	throw new Error("The address is not among the scanned wallet addresses.");
}

function signedMessageHash(message: string): Uint8Array {
	const body = utf8ToBytes(message);

	return sha256(
		sha256(
			concatBytes(utf8ToBytes("\x18Bitcoin Signed Message:\n"), compactSize(body.length), body),
		),
	);
}

function compactSize(length: number): Uint8Array {
	if (length < 0xfd) return Uint8Array.of(length);
	if (length <= 0xffff) return Uint8Array.of(0xfd, length & 0xff, length >> 8);

	const bytes = new Uint8Array(5);

	bytes[0] = 0xfe;
	new DataView(bytes.buffer).setUint32(1, length, true);

	return bytes;
}
