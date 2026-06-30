import { LOCAL_ROOT_KEYRING_TYPE } from "@/core/key-manager/state/constants";
import type { KeyManagerState } from "@/core/key-manager/types";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

export function getLocalRootSeedMaterial(state: KeyManagerState): string {
	const keyring = state.keyrings.find(
		(record) => record.type === LOCAL_ROOT_KEYRING_TYPE && record.material.kind === "seed",
	);

	if (!keyring) {
		throw new WalletRpcResourceUnavailableError(
			"No local-root seed keyring is available for Liquid.",
			undefined,
			WALLET_RPC_ERROR_REASONS.MISSING_LOCAL_ROOT_KEYRING,
		);
	}

	return keyring.material.value;
}
