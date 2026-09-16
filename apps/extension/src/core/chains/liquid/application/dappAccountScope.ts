import type { AccountGroupRecord } from "@/core/accounts/application/account-registry/model/account-group";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import type {
	AccountGroupId,
	AccountIdentifier,
	ChainId,
	KeySourceId,
} from "@/core/accounts/application/account-registry/model/identifiers";
import { resolveChainAccount } from "@/core/accounts/application/account-registry/operations/resolveChainAccount";
import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { WalletRpcUnauthorizedError } from "@/core/wallet-rpc/errors";

import type { LiquidChainRecord } from "../chains/LiquidChainRecord";
import type { LiquidWalletAccount, LiquidWalletBackend } from "./backends/LiquidWalletBackend";

export type LiquidDappAccountTarget = {
	accountGroupId: AccountGroupId;
	accountGroupIndex: number;
	keySourceId?: KeySourceId;
};

export type LiquidDappAccountScope = {
	default: LiquidDappAccountTarget | null;
	resolve: (accountIdentifier: string) => LiquidDappAccountTarget | null;
};

export type LiquidDappAccountResolution = {
	accountScope?: LiquidDappAccountScope;
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	updateKeyManagerState?: UpdateKeyManagerState;
	walletBackend: LiquidWalletBackend;
};

export async function resolveDappAccount(
	context: LiquidDappAccountResolution,
	requestedAccountIdentifier?: string,
): Promise<LiquidWalletAccount> {
	const { accountScope, chain, keyManagerState, updateKeyManagerState, walletBackend } = context;

	if (!accountScope) {
		return walletBackend.resolveAccount({ chain, keyManagerState, updateKeyManagerState });
	}

	const target = requestedAccountIdentifier
		? accountScope.resolve(requestedAccountIdentifier)
		: accountScope.default;

	if (!target) {
		throw new WalletRpcUnauthorizedError(
			requestedAccountIdentifier ?? "account",
			requestedAccountIdentifier
				? `Account "${requestedAccountIdentifier}" is not authorized for this session.`
				: "No authorized account is available for this session.",
		);
	}

	return walletBackend.resolveAccount({
		accountGroupId: target.accountGroupId,
		accountGroupIndex: target.accountGroupIndex,
		chain,
		keySourceId: target.keySourceId,
		keyManagerState,
		updateKeyManagerState,
	});
}

export function resolveAccountGroupIdsForIdentifiers(
	accountModel: AccountModelState,
	chainId: ChainId,
	accountIdentifiers: readonly string[],
): AccountGroupId[] {
	const wanted = new Set(accountIdentifiers);
	const groupIds = new Set<AccountGroupId>();

	for (const chainAccount of Object.values(accountModel.chainAccounts)) {
		if (chainAccount.chainId !== chainId) continue;
		if (!wanted.has(chainAccount.accountIdentifier)) continue;

		groupIds.add(chainAccount.accountGroupId);
	}

	return [...groupIds];
}

export function buildLiquidDappAccountScope(input: {
	accountGroupIds: readonly string[];
	accountModel: AccountModelState;
	chainId: ChainId;
}): LiquidDappAccountScope {
	const { accountGroupIds, accountModel, chainId } = input;

	const authorizedGroups = accountGroupIds
		.map((id) => accountModel.accountGroups[id as AccountGroupId])
		.filter((group): group is AccountGroupRecord => Boolean(group))
		.toSorted((left, right) => (left.groupIndex ?? 0) - (right.groupIndex ?? 0));

	const toTarget = (group: AccountGroupRecord): LiquidDappAccountTarget => ({
		accountGroupId: group.id,
		accountGroupIndex: group.groupIndex ?? 0,
		keySourceId: accountModel.wallets[group.walletId]?.keySourceId,
	});

	const defaultGroup =
		authorizedGroups.find((group) => group.id === accountModel.selectedAccountGroupId) ??
		authorizedGroups[0];

	return {
		default: defaultGroup ? toTarget(defaultGroup) : null,
		resolve: (accountIdentifier) => {
			for (const group of authorizedGroups) {
				const chainAccount = resolveChainAccount({
					accountGroupId: group.id,
					accountIdentifier: accountIdentifier as AccountIdentifier,
					accountModel,
					chainId,
				});

				if (chainAccount) return toTarget(group);
			}

			return null;
		},
	};
}
