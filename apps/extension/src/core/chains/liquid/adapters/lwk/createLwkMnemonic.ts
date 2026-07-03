import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LwkWasmModule } from "./loadLwkWasm";

export function createLwkMnemonicFromSeedMaterial(
	lwk: LwkWasmModule,
	seedMaterial: string,
): InstanceType<LwkWasmModule["Mnemonic"]> {
	const normalizedSeedMaterial = seedMaterial.trim();

	if (!normalizedSeedMaterial) {
		throw new WalletRpcResourceUnavailableError(
			"Local root material is empty.",
			undefined,
			WALLET_RPC_ERROR_REASONS.INVALID_LOCAL_ROOT_MATERIAL,
		);
	}

	try {
		return new lwk.Mnemonic(normalizedSeedMaterial);
	} catch {
		const entropy = tryDecodeBase64UrlEntropy(normalizedSeedMaterial);

		if (!entropy) {
			throw new WalletRpcResourceUnavailableError(
				"Local root material must be a BIP-39 mnemonic or generated base64url entropy before Liquid can be enabled.",
				undefined,
				WALLET_RPC_ERROR_REASONS.INVALID_LOCAL_ROOT_MATERIAL,
			);
		}

		try {
			return lwk.Mnemonic.fromEntropy(entropy);
		} catch {
			throw new WalletRpcResourceUnavailableError(
				"Local root entropy is not compatible with the LWK mnemonic backend.",
				undefined,
				WALLET_RPC_ERROR_REASONS.INCOMPATIBLE_LOCAL_ROOT_ENTROPY,
			);
		}
	}
}

function tryDecodeBase64UrlEntropy(value: string): Uint8Array | null {
	try {
		const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
		const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
		const binary = atob(paddedBase64);
		const bytes = new Uint8Array(binary.length);

		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}

		return bytes.length >= 16 ? bytes : null;
	} catch {
		return null;
	}
}
