import { createDappSessionId } from "../ids/createAccountModelId";
import type { AccountModelState } from "../model/account-model";
import type {
	DappSessionRecord,
	DappSessionScope,
	DappSessionTransport,
} from "../model/dapp-session";

export type GrantDappSessionInput = {
	accountModel: AccountModelState;
	createdAt?: number;
	expiresAt?: number;
	metadata?: Record<string, unknown>;
	origin?: string;
	peerName?: string;
	scope: DappSessionScope;
	topic?: string;
	transport: DappSessionTransport;
};

export type GrantDappSessionResult = {
	accountModel: AccountModelState;
	dappSession: DappSessionRecord;
};

export function grantDappSession(input: GrantDappSessionInput): GrantDappSessionResult {
	const now = input.createdAt ?? Date.now();
	const dappSession: DappSessionRecord = {
		createdAt: now,
		expiresAt: input.expiresAt,
		id: createDappSessionId(),
		metadata: input.metadata,
		origin: input.origin,
		peerName: input.peerName,
		scope: {
			accountGroupIds: dedupe(input.scope.accountGroupIds),
			chainAccountIds: dedupe(input.scope.chainAccountIds),
			chains: dedupe(input.scope.chains),
			events: dedupe(input.scope.events),
			methods: dedupe(input.scope.methods),
		},
		topic: input.topic,
		transport: input.transport,
		updatedAt: now,
	};

	return {
		accountModel: {
			...input.accountModel,
			dappSessions: {
				...input.accountModel.dappSessions,
				[dappSession.id]: dappSession,
			},
			updatedAt: now,
		},
		dappSession,
	};
}

function dedupe<T>(values: T[]): T[] {
	return [...new Set(values)];
}
