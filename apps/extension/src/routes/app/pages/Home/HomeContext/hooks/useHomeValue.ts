import { useMemo } from "react";

import type { AccountGroupRecord } from "@/core/accounts/application/account-registry/model/account-group";
import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { RenameAccountInput } from "@/core/accounts/application/accounts-rpc/model/types";
import type { ChainId, ChainRecord } from "@/core/chains/application/ChainRecord";

import { usePortfolio } from "./usePortfolio";

export type HomeValueInput = {
	accountGroup: AccountGroupRecord;
	accountGroups: AccountGroupRecord[];
	renameAccount: (input: RenameAccountInput) => void;
	selectAccount: (accountGroupId: AccountGroupId) => void;
	chain: ChainRecord;
	chains: ChainRecord[];
	selectChain: (chainId: ChainId) => void;
};

/**
 * Assembles the home context value from the resolved account and chain axes plus the
 * portfolio axis — all backend-backed. Portfolio is keyed by the selected account and
 * chain so it re-reads on a switch. Storybook bypasses this via MockHomeProvider.
 */
export function useHomeValue(input: HomeValueInput) {
	const portfolio = usePortfolio({
		accountGroupId: input.accountGroup.id,
		chainId: input.chain.id,
	});

	return useMemo(
		() => ({
			accountGroup: input.accountGroup,
			accountGroups: input.accountGroups,
			renameAccount: input.renameAccount,
			selectAccount: input.selectAccount,
			chain: input.chain,
			chains: input.chains,
			selectChain: input.selectChain,
			portfolio,
		}),
		[
			input.accountGroup,
			input.accountGroups,
			input.renameAccount,
			input.selectAccount,
			input.chain,
			input.chains,
			input.selectChain,
			portfolio,
		],
	);
}
