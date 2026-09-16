import type { AccountModelState } from "../model/account-model";
import type { DappSessionRecord, DappSessionTransport } from "../model/dapp-session";

export type FindDappSessionInput = {
	now?: number;
	origin: string;
	transport: DappSessionTransport;
};

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
