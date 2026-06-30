import { createAccountRegistry } from "@/core/accounts/application/account-registry";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";

import type { LiquidChainId } from "../domain/LiquidChain";
import {
	liquidDescriptorWalletAccountAdapter,
	type LiquidDescriptorWalletAccountContext,
	type LiquidDescriptorWalletAccountMetadata,
} from "./descriptor-wallet/liquidDescriptorWalletAccountAdapter";

export type EnsureLiquidDescriptorWalletAccountInput = {
	accountGroupId?: AccountGroupId;
	accountModel: AccountModelState;
	chainId: LiquidChainId;
	context: LiquidDescriptorWalletAccountContext;
	createdAt?: number;
};

export function createLiquidAccountRegistry() {
	const accountRegistry = createAccountRegistry({
		accountTypes: [liquidDescriptorWalletAccountAdapter],
	});

	return {
		ensureDescriptorWalletAccount(input: EnsureLiquidDescriptorWalletAccountInput) {
			return accountRegistry.ensureChainAccount<
				LiquidDescriptorWalletAccountContext,
				LiquidDescriptorWalletAccountMetadata
			>({
				accountGroupId: input.accountGroupId,
				accountModel: input.accountModel,
				accountTypeId: liquidDescriptorWalletAccountAdapter.id,
				chainId: input.chainId,
				context: input.context,
				createdAt: input.createdAt,
			});
		},
	};
}
