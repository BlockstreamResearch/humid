import type { KeySourceId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { KeyManagerState } from "@/core/key-manager/types";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

export function getLocalRootSeedMaterial(state: KeyManagerState): string {
	const keySource = Object.values(state.accountModel.keySources).find(
		(record) => record.kind === "local-root" && record.material.kind === "seed",
	);
	const secretMaterial = keySource ? state.secretMaterials[keySource.id] : undefined;

	if (!secretMaterial || secretMaterial.kind !== "seed") {
		throw new WalletRpcResourceUnavailableError(
			"No local-root seed key source is available for Liquid.",
			undefined,
			WALLET_RPC_ERROR_REASONS.MISSING_LOCAL_ROOT_KEYRING,
		);
	}

	return secretMaterial.value;
}

/**
 * The seed material (mnemonic) for a specific key source — the selected account's
 * wallet, so imported wallets derive from their own seed rather than the local root.
 */
export function getSeedMaterialForKeySource(
	state: KeyManagerState,
	keySourceId: KeySourceId,
): string {
	const secretMaterial = state.secretMaterials[keySourceId];

	if (!secretMaterial || (secretMaterial.kind !== "seed" && secretMaterial.kind !== "mnemonic")) {
		throw new WalletRpcResourceUnavailableError(
			"No seed key source is available for the selected account.",
			undefined,
			WALLET_RPC_ERROR_REASONS.MISSING_LOCAL_ROOT_KEYRING,
		);
	}

	return secretMaterial.value;
}
