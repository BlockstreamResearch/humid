import type { AccountRegistry } from "@/core/accounts/application/account-registry/AccountRegistry";
import type { AccountGroupRecord } from "@/core/accounts/application/account-registry/model/account-group";
import { getUnlockedChainStoreState } from "@/core/chains/application/chain-store/secureChainStore";
import { walletVaultBackground } from "@/core/secure-vault/application/wallet-vault/background";

import type { ResolveLiquidWalletAccountInput } from "../application/backends/LiquidWalletBackend";
import type { LiquidChainRecord } from "../chains/LiquidChainRecord";
import { resolveUnlockedLiquidChain } from "../chains/resolveLiquidChain";
import type { LiquidChainGroup } from "../contract";
import { parseLiquidChainId } from "../domain/validation";

export type SelectedLiquidAccount = {
	accountGroupId: string;
	chainId: string;
	input: ResolveLiquidWalletAccountInput;
};

export type LiquidAccounts = ReturnType<typeof createLiquidAccounts>;

export function createLiquidAccounts(chainGroup: LiquidChainGroup, registry: AccountRegistry) {
	const { keyManager } = walletVaultBackground;

	const inputFor = (
		group: AccountGroupRecord,
		chain: LiquidChainRecord,
	): ResolveLiquidWalletAccountInput => {
		const keyManagerState = keyManager.getState();

		return {
			accountGroupId: group.id,
			accountGroupIndex: group.groupIndex ?? 0,
			chain,
			keyManagerState,
			keySourceId: keyManagerState.accountModel.wallets[group.walletId]?.keySourceId,
			updateKeyManagerState: keyManager.updateState,
		};
	};

	return {
		async selected(): Promise<SelectedLiquidAccount> {
			const chainStore = await getUnlockedChainStoreState();
			const chainId = chainStore.selectedChainIds[chainGroup.id] ?? chainGroup.chains[0].id;
			const chain = await resolveUnlockedLiquidChain(parseLiquidChainId(chainId));
			const group = registry.getSelectedAccountGroup(keyManager.getState().accountModel);

			return { accountGroupId: group.id, chainId: chain.id, input: inputFor(group, chain) };
		},

		async identifiersOf(chainId: string, accountGroupIds: readonly string[]): Promise<string[]> {
			let liquidChainId;

			try {
				liquidChainId = parseLiquidChainId(chainId);
			} catch {
				return [];
			}

			const chain = await resolveUnlockedLiquidChain(liquidChainId);
			const groups = Object.values(keyManager.getState().accountModel.accountGroups);
			const identifiers: string[] = [];

			for (const accountGroupId of accountGroupIds) {
				const group = groups.find((candidate) => candidate.id === accountGroupId);

				if (!group) continue;

				// oxlint-disable-next-line no-await-in-loop -- each resolution may update the key manager state
				const identifier = await chainGroup.accountRuntime.resolveAccountIdentifier(
					inputFor(group, chain),
				);

				identifiers.push(identifier);
			}

			return identifiers;
		},
	};
}
