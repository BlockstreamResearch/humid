import type { AccountModelState } from "../model/account-model";
import type { DappSessionRecord, DappSessionTransport } from "../model/dapp-session";

export type FindDappSessionInput = {
	now?: number;
	origin: string;
	transport: DappSessionTransport;
};

/**
 * Returns the active (non-expired) session for an origin on a transport, or null.
 * When several match, the most recently updated one wins.
 */
export function findDappSession(
	accountModel: AccountModelState,
	input: FindDappSessionInput,
): DappSessionRecord | null {
	const now = input.now ?? Date.now();

	return (
		Object.values(accountModel.dappSessions)
			.filter((session) => session.transport === input.transport && session.origin === input.origin)
			.filter((session) => session.expiresAt === undefined || session.expiresAt > now)
			.toSorted((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
	);
}
