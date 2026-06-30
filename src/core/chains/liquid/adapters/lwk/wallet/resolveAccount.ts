import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import { createLiquidAccountRegistry } from "../../../accounts/createLiquidAccountRegistry";
import type {
	LiquidWalletAccount,
	ResolveLiquidWalletAccountInput,
} from "../../../application/backends/LiquidWalletBackend";
import { toLiquidAssetId } from "../../../domain/validation";
import { createLwkBlockchainClient } from "../createLwkBlockchainClient";
import { createLwkMnemonicFromSeedMaterial } from "../createLwkMnemonic";
import { createLwkNetwork } from "../createLwkNetwork";
import { getLocalRootSeedMaterial } from "../getLocalRootSeedMaterial";
import { loadLwkWasm } from "../loadLwkWasm";

export async function createLwkLiquidAccount(
	input: ResolveLiquidWalletAccountInput,
): Promise<LiquidWalletAccount> {
	const seedMaterial = getLocalRootSeedMaterial(input.keyManagerState);
	const lwk = await loadLwkWasm();
	const network = createLwkNetwork(lwk, input.chain.id);
	const blockchainClient = createLwkBlockchainClient(lwk, input.chain, network);
	const mnemonic = createLwkMnemonicFromSeedMaterial(lwk, seedMaterial);

	try {
		const signer = new lwk.Signer(mnemonic, network);
		const descriptor = signer.wpkhSlip77Descriptor();
		const wollet = new lwk.Wollet(network, descriptor);
		const dwid = wollet.dwid();
		const rawPolicyAssetId = network.policyAsset().toString();
		const policyAssetId = toLiquidAssetId(input.chain.id, rawPolicyAssetId);
		const accountIdentifier = `${input.chain.id}:${dwid}` as const;

		if (input.updateKeyManagerState) {
			const accountRegistry = createLiquidAccountRegistry();

			await input.updateKeyManagerState((state) => {
				const ensured = accountRegistry.ensureDescriptorWalletAccount({
					accountModel: state.accountModel,
					chainId: input.chain.id,
					context: {
						dwid,
						policyAssetId,
						rawPolicyAssetId,
					},
				});

				return {
					...state,
					accountModel: ensured.accountModel,
				};
			});
		}

		return {
			accountIdentifier,
			chain: input.chain,
			chainId: input.chain.id,
			dwid,
			implementation: {
				blockchainClient,
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
