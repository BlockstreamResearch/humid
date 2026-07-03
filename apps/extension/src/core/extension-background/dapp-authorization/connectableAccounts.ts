import type { AccountRegistry } from "@/core/accounts/application/account-registry/AccountRegistry";
import type { AccountGroupRecord } from "@/core/accounts/application/account-registry/model/account-group";
import type { AccountModelState } from "@/core/accounts/application/account-registry/model/account-model";
import type { AccountGroupId } from "@/core/accounts/application/account-registry/model/identifiers";

import type { RequestHandlerMap } from "../transport";
import { DAPP_CONNECT_LIST_ACCOUNTS_METHOD, type DappConnectAccount } from "./connectConfirmation";
import { dappAuthorizationErrors } from "./errors";

/** Non-hidden account groups a dapp may connect to, ordered by their HD `groupIndex`. */
export function listConnectableAccountGroups(
	accountModel: AccountModelState,
): AccountGroupRecord[] {
	return Object.values(accountModel.accountGroups)
		.filter((group) => !group.hidden)
		.toSorted((left, right) => (left.groupIndex ?? 0) - (right.groupIndex ?? 0));
}

/** The wallet's currently selected account group id, or undefined when none is resolvable. */
export function trySelectedAccountGroupId(
	registry: AccountRegistry,
	accountModel: AccountModelState,
): AccountGroupId | undefined {
	try {
		return registry.getSelectedAccountGroup(accountModel).id;
	} catch {
		return undefined;
	}
}

/** The account list the connect modal renders: each group + whether it is current / already connected. */
export function buildDappConnectAccounts(
	accountModel: AccountModelState,
	registry: AccountRegistry,
	connectedAccountGroupIds: readonly string[] = [],
): DappConnectAccount[] {
	const currentAccountGroupId = trySelectedAccountGroupId(registry, accountModel);
	const connectedSet = new Set(connectedAccountGroupIds);

	return listConnectableAccountGroups(accountModel).map((group) => ({
		id: group.id,
		isConnected: connectedSet.has(group.id),
		isCurrent: group.id === currentAccountGroupId,
		name: group.name,
	}));
}

/**
 * Account groups the origin's active injected session already grants. The connect modal pre-checks
 * these on a reconnect so a user's previously-authorized accounts aren't silently dropped.
 */
export function connectedAccountGroupIdsForOrigin(
	registry: AccountRegistry,
	accountModel: AccountModelState,
	origin: string,
): string[] {
	const session = registry.findDappSession(accountModel, {
		now: Date.now(),
		origin,
		transport: "injected",
	});

	return session ? [...session.scope.accountGroupIds] : [];
}

/**
 * Popup-facing handler for {@link DAPP_CONNECT_LIST_ACCOUNTS_METHOD}: the connect modal calls it
 * after unlocking a locked wallet to load the selectable accounts. Never reachable from a dapp
 * (the transport routes injected senders to a separate registry).
 */
export function createDappConnectInternalHandlers(dependencies: {
	getAccountModel: () => AccountModelState | null;
	registry: AccountRegistry;
}): RequestHandlerMap {
	return {
		[DAPP_CONNECT_LIST_ACCOUNTS_METHOD]: () => {
			const accountModel = dependencies.getAccountModel();

			if (!accountModel) {
				throw dappAuthorizationErrors.walletLocked("Unlock the wallet to list accounts.");
			}

			return buildDappConnectAccounts(accountModel, dependencies.registry);
		},
	};
}
