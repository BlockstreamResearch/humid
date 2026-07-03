import type { AccountModelState } from "../model/account-model";
import type { AccountGroupId, DappSessionId } from "../model/identifiers";

export type RevokeAccountFromDappSessionInput = {
	accountGroupId: AccountGroupId;
	accountModel: AccountModelState;
	sessionId: DappSessionId;
	updatedAt?: number;
};

export type RevokeAccountFromDappSessionResult = {
	accountModel: AccountModelState;
	/** True when the session existed and had granted this account group. */
	revoked: boolean;
	/** True when removing the account emptied the session's account set, so it was deleted entirely. */
	sessionRemoved: boolean;
};

/**
 * Drop one authorized account group from a dapp session's scope — the per-account "disconnect" a
 * user triggers from the popup. When it was the session's last account the grant is empty, so the
 * whole session is deleted (a full disconnect for that origin). No-op (revoked:false) when the
 * session is unknown or never granted that account.
 */
export function revokeAccountFromDappSession(
	input: RevokeAccountFromDappSessionInput,
): RevokeAccountFromDappSessionResult {
	const session = input.accountModel.dappSessions[input.sessionId];

	if (!session || !session.scope.accountGroupIds.includes(input.accountGroupId)) {
		return { accountModel: input.accountModel, revoked: false, sessionRemoved: false };
	}

	const updatedAt = input.updatedAt ?? Date.now();
	const remaining = session.scope.accountGroupIds.filter((id) => id !== input.accountGroupId);
	const dappSessions = { ...input.accountModel.dappSessions };

	if (remaining.length === 0) {
		delete dappSessions[input.sessionId];

		return {
			accountModel: { ...input.accountModel, dappSessions, updatedAt },
			revoked: true,
			sessionRemoved: true,
		};
	}

	dappSessions[input.sessionId] = {
		...session,
		scope: { ...session.scope, accountGroupIds: remaining },
		updatedAt,
	};

	return {
		accountModel: { ...input.accountModel, dappSessions, updatedAt },
		revoked: true,
		sessionRemoved: false,
	};
}
