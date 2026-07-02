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
import { getLocalRootSeedMaterial, getSeedMaterialForKeySource } from "../getLocalRootSeedMaterial";
import { loadLwkWasm } from "../loadLwkWasm";

export async function createLwkLiquidAccount(
	input: ResolveLiquidWalletAccountInput,
): Promise<LiquidWalletAccount> {
	const seedMaterial = input.keySourceId
		? getSeedMaterialForKeySource(input.keyManagerState, input.keySourceId)
		: getLocalRootSeedMaterial(input.keyManagerState);
	const lwk = await loadLwkWasm();
	const network = createLwkNetwork(lwk, input.chain);
	const blockchainClient = createLwkBlockchainClient(lwk, input.chain, network);
	const masterMnemonic = createLwkMnemonicFromSeedMaterial(lwk, seedMaterial);

	try {
		const masterSigner = new lwk.Signer(masterMnemonic, network);
		// Each account group derives a distinct wallet from the one seed: group 0 is the
		// master seed's account; groups N>=1 use a BIP-85 child mnemonic at index N, so the
		// whole derivation stays inside LWK (no hand-rolled key math).
		const accountGroupIndex = input.accountGroupIndex ?? 0;
		const signer =
			accountGroupIndex === 0
				? masterSigner
				: new lwk.Signer(masterSigner.derive_bip85_mnemonic(accountGroupIndex, 12), network);
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
			descriptor: descriptor.toString(),
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
	} catch (error) {
		console.error("[liquid] Failed to derive the Liquid account", error);

		const cause = error instanceof Error ? error.message : String(error);

		throw new WalletRpcResourceUnavailableError(
			`Could not derive a Liquid software wallet from the local root keyring: ${cause}`,
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_DERIVATION_FAILED,
		);
	}
}
