import type { AccountGroupRecord } from "../model/account-group";
import type { AccountModelState } from "../model/account-model";
import type { AccountGroupId, KeySourceId, WalletId } from "../model/identifiers";
import { pruneDappSessionsForRemovedAccountGroup } from "./removeAccountGroup";
import { removeAccountGroupEntities } from "./removeAccountGroupEntities";

export type RemoveWalletInput = {
	accountModel: AccountModelState;
	updatedAt?: number;
	walletId: WalletId;
};

export type RemoveWalletResult = {
	accountModel: AccountModelState;
	keySourceId: KeySourceId;
	removedAccountGroupIds: AccountGroupId[];
};

/**
 * Removes a whole wallet from the account model — the exact inverse of `importSeedWallet`. It deletes
 * every account group of the wallet (with their materialized chain accounts + addresses), the wallet
 * record, and its key source. The plaintext seed lives in the key manager's `secretMaterials`, keyed
 * by the returned `keySourceId`, so the caller (`removeWalletFromKeyManagerState`) purges it there.
 *
 * Guard: forgetting a wallet destroys its seed, so this refuses to forget the last remaining wallet —
 * that would leave the vault with zero accounts and no way back in. (Removing a single account is the
 * separate, guarded `removeAccountGroup` flow; this is its whole-wallet counterpart.) Reassigns the
 * selected group when it pointed at a removed one. Chain-agnostic — no signing or chain specifics.
 */
export function removeWallet(input: RemoveWalletInput): RemoveWalletResult {
	const wallet = input.accountModel.wallets[input.walletId];

	if (!wallet) {
		throw new Error(`Wallet is not available: ${input.walletId}`);
	}

	const removedAccountGroupIds = wallet.accountGroupIds;
	const removedGroupIds = new Set<AccountGroupId>(removedAccountGroupIds);

	const survivingGroups = Object.values(input.accountModel.accountGroups).filter(
		(group) => !removedGroupIds.has(group.id),
	);

	if (survivingGroups.length === 0) {
		throw new Error("Cannot forget the only wallet; at least one wallet must remain.");
	}

	const now = input.updatedAt ?? Date.now();

	const accountGroups = { ...input.accountModel.accountGroups };
	const chainAccounts = { ...input.accountModel.chainAccounts };
	const addresses = { ...input.accountModel.addresses };

	// Thread the dapp-session prune across every removed group: each pass strips that group (and its
	// chain accounts) from any session it was authorized in, deleting sessions left with no account.
	let dappSessionsModel = input.accountModel;

	for (const accountGroupId of removedAccountGroupIds) {
		const group = input.accountModel.accountGroups[accountGroupId];

		if (group) {
			removeAccountGroupEntities({ accountGroups, addresses, chainAccounts }, group);
			dappSessionsModel = pruneDappSessionsForRemovedAccountGroup(dappSessionsModel, group, now);
		}
	}

	const wallets = { ...input.accountModel.wallets };
	delete wallets[wallet.id];

	const keySources = { ...input.accountModel.keySources };
	delete keySources[wallet.keySourceId];

	const selectedWasRemoved =
		input.accountModel.selectedAccountGroupId !== undefined &&
		removedGroupIds.has(input.accountModel.selectedAccountGroupId);
	const selectedAccountGroupId = selectedWasRemoved
		? pickFallbackSelectedGroupId(survivingGroups)
		: input.accountModel.selectedAccountGroupId;

	return {
		accountModel: {
			...input.accountModel,
			accountGroups,
			addresses,
			chainAccounts,
			dappSessions: dappSessionsModel.dappSessions,
			keySources,
			selectedAccountGroupId,
			updatedAt: now,
			wallets,
		},
		keySourceId: wallet.keySourceId,
		removedAccountGroupIds,
	};
}

/**
 * When the forgotten wallet held the selected group, fall to the surviving group with the lowest
 * `groupIndex` (ties broken by creation order) — deterministic and stable with how the account list
 * is ordered. The guard above guarantees at least one survivor, so this always resolves.
 */
function pickFallbackSelectedGroupId(survivingGroups: AccountGroupRecord[]): AccountGroupId {
	const [fallback] = survivingGroups.toSorted(
		(left, right) =>
			(left.groupIndex ?? 0) - (right.groupIndex ?? 0) || left.createdAt - right.createdAt,
	);

	return fallback.id;
}
