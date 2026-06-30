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
