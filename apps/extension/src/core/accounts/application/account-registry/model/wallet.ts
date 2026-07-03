import type { AccountGroupId, KeySourceId, WalletId } from "./identifiers";
import type { TimestampMs } from "./time";

export type WalletKind = "entropy" | "external" | "hardware" | "single-key";

export type WalletRecord = {
	accountGroupIds: AccountGroupId[];
	createdAt: TimestampMs;
	id: WalletId;
	keySourceId: KeySourceId;
	kind: WalletKind;
	metadata?: Record<string, unknown>;
	name: string;
	updatedAt: TimestampMs;
};
