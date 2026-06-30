import type { AccountGroupId, ChainAccountId, WalletId } from "./identifiers";
import type { TimestampMs } from "./time";

export type AccountGroupKind = "multichain" | "single-chain";

export type AccountGroupRecord = {
	chainAccountIds: ChainAccountId[];
	createdAt: TimestampMs;
	groupIndex?: number;
	hidden?: boolean;
	id: AccountGroupId;
	kind: AccountGroupKind;
	metadata?: Record<string, unknown>;
	name: string;
	pinned?: boolean;
	updatedAt: TimestampMs;
	walletId: WalletId;
};
