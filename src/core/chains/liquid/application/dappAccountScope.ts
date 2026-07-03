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

/** The HD coordinates the wallet backend needs to derive one authorized account. */
export type LiquidDappAccountTarget = {
	accountGroupId: AccountGroupId;
	accountGroupIndex: number;
	keySourceId?: KeySourceId;
};

/**
 * The per-session account authorization a dapp call carries: which account to derive when the
 * dapp names none, and how to resolve a dapp-named ELIP-1 account-id — both constrained to the
 * session's authorized account groups. Built from the chain-agnostic account model (see
 * {@link buildLiquidDappAccountScope}); the derivation coordinates it yields are the only
 * Liquid-specific part.
 */
export type LiquidDappAccountScope = {
	/**
	 * Target when the dapp names no account: the wallet's globally-selected account when it is in
	 * the authorized set, else the lowest-`groupIndex` authorized group (null if none). ELIP-1 says
	 * a no-account read/sign applies to the session's account and MUST reject on ambiguity; we
	 * instead follow the wallet's selection (MetaMask-style Model B) — a deliberate deviation for
	 * multi-account sessions that also makes an in-wallet account switch reactive for the dapp.
	 */
	default: LiquidDappAccountTarget | null;
	/**
	 * Map an ELIP-1 account-id (`chain_id:dwid`) to its derivation target, but only when it
	 * belongs to an authorized, materialized account group. Null → not authorized / unknown.
	 */
	resolve: (accountIdentifier: string) => LiquidDappAccountTarget | null;
};

/** Minimal method-context shape {@link resolveDappAccount} needs (every Liquid RPC context fits). */
export type LiquidDappAccountResolution = {
	accountScope?: LiquidDappAccountScope;
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	updateKeyManagerState?: UpdateKeyManagerState;
	walletBackend: LiquidWalletBackend;
};

/**
 * Resolve the account a dapp RPC method operates on, enforcing the session's per-account grant.
 * Internal calls (no `accountScope`) keep full access to the default account. For a dapp call the
 * target is the named account (must be authorized) or the session default; an unauthorized /
 * unknown account raises a 4100 error. Reads degrade to their capability stub in the wrapper
 * before reaching here, so this hard error is the action-path guard.
 */
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

/**
 * Map a set of ELIP-1 account-ids (`chain_id:dwid`) to the account groups that own them on the
 * given chain. The injected path authorizes account *groups* directly; the WalletConnect path
 * authorizes *accounts* (its approved scope names CAIP-10 accounts), so it converts them here
 * before {@link buildLiquidDappAccountScope}. Unknown / other-chain ids are dropped.
 */
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

/**
 * Build a {@link LiquidDappAccountScope} from a session's authorized account groups and the
 * current account model. Chain-agnostic inputs in, Liquid derivation coordinates out: the default
 * follows the wallet's selected account when authorized (Model B), else the lowest-`groupIndex`
 * authorized group; `resolve` searches only those groups, so an unauthorized account-id can never
 * map to a target.
 */
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

	// Model B (MetaMask-style): the no-account default follows the wallet's globally-selected account
	// when it is within the session's authorized set, so switching account in the wallet reactively
	// changes what an injected dapp reads (paired with the accountsChanged event). Falls back to the
	// lowest-`groupIndex` authorized group otherwise.
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
