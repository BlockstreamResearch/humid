import type { AccountGroupId, ChainAccountId, ChainId, DappSessionId } from "./identifiers";
import type { TimestampMs } from "./time";

export type DappSessionTransport = "injected" | "walletconnect";

export type DappSessionScope = {
	accountGroupIds: AccountGroupId[];
	chainAccountIds: ChainAccountId[];
	chains: ChainId[];
	events: string[];
	/**
	 * The session's authorized method surface. Keys are every method the session may call —
	 * this is what the CAIP-25 response advertises. `true` runs the method without asking;
	 * `false` confirms it with the user on every call.
	 */
	methods: Record<string, boolean>;
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
