import type { AccountModelState } from "../model/account-model";
import type { DappSessionId } from "../model/identifiers";

export type RevokeDappSessionInput = {
	accountModel: AccountModelState;
	sessionId: DappSessionId;
	updatedAt?: number;
};

export type RevokeDappSessionResult = {
	accountModel: AccountModelState;
	revoked: boolean;
};

export function revokeDappSession(input: RevokeDappSessionInput): RevokeDappSessionResult {
	if (!input.accountModel.dappSessions[input.sessionId]) {
		return { accountModel: input.accountModel, revoked: false };
	}

	const dappSessions = { ...input.accountModel.dappSessions };
	delete dappSessions[input.sessionId];

	return {
		accountModel: {
			...input.accountModel,
			dappSessions,
			updatedAt: input.updatedAt ?? Date.now(),
		},
		revoked: true,
	};
}
