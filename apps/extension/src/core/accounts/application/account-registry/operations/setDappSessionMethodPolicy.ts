import type { AccountModelState } from "../model/account-model";
import type { DappSessionId } from "../model/identifiers";

export type SetDappSessionMethodPolicyInput = {
	accountModel: AccountModelState;
	methods: Record<string, boolean>;
	sessionId: DappSessionId;
	updatedAt?: number;
};

export type SetDappSessionMethodPolicyResult = {
	accountModel: AccountModelState;
	updated: boolean;
};

export function setDappSessionMethodPolicy(
	input: SetDappSessionMethodPolicyInput,
): SetDappSessionMethodPolicyResult {
	const session = input.accountModel.dappSessions[input.sessionId];

	if (!session) {
		return { accountModel: input.accountModel, updated: false };
	}

	const methods = { ...session.scope.methods };
	let updated = false;

	for (const [method, silent] of Object.entries(input.methods)) {
		if (method in methods && methods[method] !== silent) {
			methods[method] = silent;
			updated = true;
		}
	}

	if (!updated) return { accountModel: input.accountModel, updated: false };

	const updatedAt = input.updatedAt ?? Date.now();
	const dappSessions = {
		...input.accountModel.dappSessions,
		[input.sessionId]: {
			...session,
			scope: { ...session.scope, methods },
			updatedAt,
		},
	};

	return {
		accountModel: { ...input.accountModel, dappSessions, updatedAt },
		updated: true,
	};
}
