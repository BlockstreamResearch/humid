import type { AccountModelState } from "../model/account-model";
import type { DappSessionId } from "../model/identifiers";

export type SetDappSessionMethodPolicyInput = {
	accountModel: AccountModelState;
	/** Method → run-without-confirmation. Only keys already in the session's surface are applied. */
	methods: Record<string, boolean>;
	sessionId: DappSessionId;
	updatedAt?: number;
};

export type SetDappSessionMethodPolicyResult = {
	accountModel: AccountModelState;
	/** True when the session existed and at least one of its methods changed value. */
	updated: boolean;
};

/**
 * Flip the run-without-confirmation flags of an injected dapp session's methods — the per-method
 * toggles a user edits from the connected-dapps settings. Only methods already in the session's
 * surface are touched (a settings edit can never widen the grant, mirroring connect-time). No-op
 * (updated:false) when the session is unknown or nothing actually changed.
 */
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
