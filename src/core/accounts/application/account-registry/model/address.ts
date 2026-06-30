import type { DerivationLocator } from "./chain-account";
import type { AddressId, ChainAccountId, ChainId } from "./identifiers";
import type { TimestampMs } from "./time";

export type AddressKind = "change" | "identity" | "receive";

export type AddressRecord = {
	address: string;
	chainAccountId: ChainAccountId;
	chainId: ChainId;
	createdAt: TimestampMs;
	derivation?: DerivationLocator;
	id: AddressId;
	kind: AddressKind;
	metadata?: Record<string, unknown>;
	updatedAt: TimestampMs;
};
