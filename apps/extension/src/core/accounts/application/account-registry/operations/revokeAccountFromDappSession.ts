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
	revoked: boolean;
	sessionRemoved: boolean;
};

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
