import type { AccountTypeAdapter } from "@/core/accounts/application/account-registry/adapters/AccountTypeAdapter";

import { LIQUID_CHAIN_GROUP_ID } from "../../chains/LiquidChainRecord";
import type { LiquidAssetId } from "../../domain/LiquidAsset";

export type LiquidDescriptorWalletAccountContext = {
	dwid: string;
	policyAssetId: LiquidAssetId;
	rawPolicyAssetId: string;
};

export type LiquidDescriptorWalletAccountMetadata = LiquidDescriptorWalletAccountContext;

export const liquidDescriptorWalletAccountAdapter = {
	chainGroupId: LIQUID_CHAIN_GROUP_ID,
	id: "liquid:descriptor-wallet",
	materialize({ chainId, context }) {
		return {
			accountIdentifier: `${chainId}:${context.dwid}` as const,
			metadata: {
				dwid: context.dwid,
				policyAssetId: context.policyAssetId,
				rawPolicyAssetId: context.rawPolicyAssetId,
			},
		};
	},
} as const satisfies AccountTypeAdapter<
	LiquidDescriptorWalletAccountContext,
	LiquidDescriptorWalletAccountMetadata
>;
