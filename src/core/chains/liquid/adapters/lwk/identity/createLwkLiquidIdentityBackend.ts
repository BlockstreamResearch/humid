import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";

import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcInvalidParamsError,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type {
	GetLiquidIdentityPublicKeyInput,
	GetLiquidIdentitySharedKeyInput,
	LiquidIdentityBackend,
	SignLiquidIdentityInput,
} from "../../../application/backends/LiquidIdentityBackend";
import {
	LIQUID_IDENTITY_PURPOSES,
	deriveSlipIdentityPath,
} from "../../../domain/identity/deriveSlipIdentityPath";
import {
	LIQUID_IDENTITY_PUBLIC_KEY_TYPE,
	LIQUID_IDENTITY_SHARED_KEY_TYPE,
	type LiquidGetIdentityPublicKeyResult,
	type LiquidGetIdentitySharedKeyResult,
	type LiquidSignIdentityResult,
} from "../../../domain/identity/types";
import { createLwkMnemonicFromSeedMaterial } from "../createLwkMnemonic";
import { getLocalRootSeedMaterial } from "../getLocalRootSeedMaterial";
import { loadLwkWasm } from "../loadLwkWasm";
import { deriveBip39Seed } from "./deriveBip39Seed";
import { deriveSlip10P256PrivateKey } from "./deriveSlip10P256PrivateKey";

export function createLwkLiquidIdentityBackend(): LiquidIdentityBackend {
	return {
		getIdentityPublicKey,
		getIdentitySharedKey,
		signIdentity,
	};
}

async function getIdentityPublicKey(
	input: GetLiquidIdentityPublicKeyInput,
): Promise<LiquidGetIdentityPublicKeyResult> {
	try {
		const keyMaterial = await deriveIdentityKeyMaterial({
			identity: input.identity,
			index: input.index,
			keyManagerState: input.keyManagerState,
			purpose: LIQUID_IDENTITY_PURPOSES.SLIP_0013,
		});

		return {
			curve: input.curve,
			identity: input.identity,
			index: input.index,
			publicKey: bytesToHex(keyMaterial.publicKey),
			type: LIQUID_IDENTITY_PUBLIC_KEY_TYPE,
		};
	} catch (error) {
		if (
			error instanceof WalletRpcInvalidParamsError ||
			error instanceof WalletRpcResourceUnavailableError
		) {
			throw error;
		}

		throw new WalletRpcResourceUnavailableError(
			"Could not derive the Liquid identity public key from the local root keyring.",
			undefined,
			WALLET_RPC_ERROR_REASONS.IDENTITY_DERIVATION_FAILED,
		);
	}
}

async function getIdentitySharedKey(
	input: GetLiquidIdentitySharedKeyInput,
): Promise<LiquidGetIdentitySharedKeyResult> {
	try {
		const theirPublicKey = parseCounterpartyPublicKey(input.theirPublicKey);
		const keyMaterial = await deriveIdentityKeyMaterial({
			identity: input.identity,
			index: input.index,
			keyManagerState: input.keyManagerState,
			purpose: LIQUID_IDENTITY_PURPOSES.SLIP_0017,
		});
		const sharedPoint = p256.getSharedSecret(keyMaterial.privateKey, theirPublicKey, false);
		const sharedSecret = getSharedSecretXCoordinate(sharedPoint);
		const sharedKey = hkdf(
			sha256,
			sharedSecret,
			hexToBytes(input.kdfSalt),
			hexToBytes(input.kdfInfo),
			32,
		);

		return {
			curve: input.curve,
			identity: input.identity,
			index: input.index,
			kdf: input.kdf,
			publicKey: bytesToHex(keyMaterial.publicKey),
			sharedKey: bytesToHex(sharedKey),
			type: LIQUID_IDENTITY_SHARED_KEY_TYPE,
		};
	} catch (error) {
		if (
			error instanceof WalletRpcInvalidParamsError ||
			error instanceof WalletRpcResourceUnavailableError
		) {
			throw error;
		}

		throw new WalletRpcResourceUnavailableError(
			"Could not derive the Liquid identity shared key from the local root keyring.",
			undefined,
			WALLET_RPC_ERROR_REASONS.IDENTITY_DERIVATION_FAILED,
		);
	}
}

async function signIdentity(input: SignLiquidIdentityInput): Promise<LiquidSignIdentityResult> {
	try {
		const keyMaterial = await deriveIdentityKeyMaterial({
			identity: input.identity,
			index: input.index,
			keyManagerState: input.keyManagerState,
			purpose: LIQUID_IDENTITY_PURPOSES.SLIP_0013,
		});
		const challenge = hexToBytes(input.challenge);
		const signedMessage = isSshIdentity(input.identity) ? sha256(challenge) : challenge;
		const signature = p256.sign(signedMessage, keyMaterial.privateKey, {
			lowS: true,
			prehash: false,
		});

		return {
			curve: input.curve,
			identity: input.identity,
			index: input.index,
			publicKey: bytesToHex(keyMaterial.publicKey),
			signature: bytesToHex(concatBytes(Uint8Array.of(0), signature.toCompactRawBytes())),
			type: LIQUID_IDENTITY_PUBLIC_KEY_TYPE,
		};
	} catch (error) {
		if (
			error instanceof WalletRpcInvalidParamsError ||
			error instanceof WalletRpcResourceUnavailableError
		) {
			throw error;
		}

		throw new WalletRpcResourceUnavailableError(
			"Could not sign the Liquid identity challenge with the local root keyring.",
			undefined,
			WALLET_RPC_ERROR_REASONS.IDENTITY_DERIVATION_FAILED,
		);
	}
}

async function deriveIdentityKeyMaterial(input: {
	identity: string;
	index: number;
	keyManagerState: GetLiquidIdentityPublicKeyInput["keyManagerState"];
	purpose: (typeof LIQUID_IDENTITY_PURPOSES)[keyof typeof LIQUID_IDENTITY_PURPOSES];
}): Promise<{
	privateKey: Uint8Array;
	publicKey: Uint8Array;
}> {
	const seedMaterial = getLocalRootSeedMaterial(input.keyManagerState);
	const lwk = await loadLwkWasm();
	const mnemonic = createLwkMnemonicFromSeedMaterial(lwk, seedMaterial);
	const seed = deriveBip39Seed(mnemonic.toString());
	const path = deriveSlipIdentityPath({
		identity: input.identity,
		index: input.index,
		purpose: input.purpose,
	});
	const privateKey = deriveSlip10P256PrivateKey(seed, path);

	return {
		privateKey,
		publicKey: p256.getPublicKey(privateKey, false),
	};
}

function parseCounterpartyPublicKey(publicKeyHex: string): Uint8Array {
	const publicKey = hexToBytes(publicKeyHex);
	let validPublicKey = false;

	try {
		validPublicKey = p256.utils.isValidPublicKey(publicKey, false);
	} catch {
		validPublicKey = false;
	}

	if (!validPublicKey) {
		throw new WalletRpcInvalidParamsError(
			"Invalid nist256p1 counterparty public key.",
			{
				theirPublicKey: publicKeyHex,
			},
			WALLET_RPC_ERROR_REASONS.INVALID_IDENTITY_PUBLIC_KEY,
		);
	}

	return publicKey;
}

function getSharedSecretXCoordinate(sharedPoint: Uint8Array): Uint8Array {
	if (sharedPoint.length !== 65 || sharedPoint[0] !== 4) {
		throw new WalletRpcResourceUnavailableError(
			"Could not derive a valid nist256p1 shared secret.",
			undefined,
			WALLET_RPC_ERROR_REASONS.IDENTITY_DERIVATION_FAILED,
		);
	}

	return sharedPoint.slice(1, 33);
}

function isSshIdentity(identity: string): boolean {
	return identity.startsWith("ssh://");
}
