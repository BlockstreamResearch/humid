import type { AccountGroupId, ChainAccountId, ChainId, DappSessionId } from "./identifiers";
import type { TimestampMs } from "./time";

export type DappSessionTransport = "injected" | "walletconnect";

export type DappSessionScope = {
	accountGroupIds: AccountGroupId[];
	chainAccountIds: ChainAccountId[];
	chains: ChainId[];
	events: string[];
	methods: string[];
};

export type DappSessionRecord = {
	createdAt: TimestampMs;
	expiresAt?: TimestampMs;
	id: DappSessionId;
	metadata?: Record<string, unknown>;
	origin?: string;
	peerName?: string;
	scope: DappSessionScope;
	topic?: string;
	transport: DappSessionTransport;
	updatedAt: TimestampMs;
};
