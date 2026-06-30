import type { ChainAccountMetadata, ChainAccountTypeId, ChainGroupId } from "./account-type";
import type {
	AccountGroupId,
	AddressId,
	AccountIdentifier,
	ChainAccountId,
	ChainId,
	KeySourceId,
	WalletId,
} from "./identifiers";
import type { TimestampMs } from "./time";

export type DerivationStandardId = string;

export type DerivationLocator = {
	accountIndex?: number;
	addressIndex?: number;
	change?: number;
	path?: string;
	standard: DerivationStandardId;
};

export type ChainAccountRecord<TMetadata extends ChainAccountMetadata = ChainAccountMetadata> = {
	accountGroupId: AccountGroupId;
	accountIdentifier: AccountIdentifier;
	accountTypeId: ChainAccountTypeId;
	addressIds: AddressId[];
	chainGroupId: ChainGroupId;
	chainId: ChainId;
	createdAt: TimestampMs;
	derivation?: DerivationLocator;
	id: ChainAccountId;
	keySourceId: KeySourceId;
	metadata?: TMetadata;
	updatedAt: TimestampMs;
	walletId: WalletId;
};
