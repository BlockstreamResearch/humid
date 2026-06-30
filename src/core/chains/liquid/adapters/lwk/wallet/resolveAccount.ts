import type { KeyManagerState } from "@/core/key-manager/types";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import { toLiquidAssetId } from "../../../domain/validation";
import type { LiquidWalletAccount } from "../../../ports/LiquidWalletBackend";
import { createLwkMnemonicFromSeedMaterial } from "../createLwkMnemonic";
import { createLwkNetwork } from "../createLwkNetwork";
import { getLocalRootSeedMaterial } from "../getLocalRootSeedMaterial";
import { loadLwkWasm } from "../loadLwkWasm";

export async function createLwkLiquidAccount(input: {
	chainId: LiquidWalletAccount["chainId"];
	keyManagerState: KeyManagerState;
}): Promise<LiquidWalletAccount> {
	const seedMaterial = getLocalRootSeedMaterial(input.keyManagerState);
	const lwk = await loadLwkWasm();
	const network = createLwkNetwork(lwk, input.chainId);
	const mnemonic = createLwkMnemonicFromSeedMaterial(lwk, seedMaterial);

	try {
		const signer = new lwk.Signer(mnemonic, network);
		const descriptor = signer.wpkhSlip77Descriptor();
		const wollet = new lwk.Wollet(network, descriptor);
		const dwid = wollet.dwid();
		const rawPolicyAssetId = network.policyAsset().toString();
		const policyAssetId = toLiquidAssetId(input.chainId, rawPolicyAssetId);

		return {
			accountIdentifier: `${input.chainId}:${dwid}`,
			chainId: input.chainId,
			dwid,
			implementation: {
				network,
				signer,
				wollet,
			},
			policyAssetId,
			rawPolicyAssetId,
		};
	} catch {
		throw new WalletRpcResourceUnavailableError(
			"Could not derive a Liquid software wallet from the local root keyring.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_DERIVATION_FAILED,
		);
	}
}
