import type { AccountGroupRecord } from "./account-group";
import type { AddressRecord } from "./address";
import type { ChainAccountRecord } from "./chain-account";
import type { DappSessionRecord } from "./dapp-session";
import type {
	AccountGroupId,
	AddressId,
	ChainAccountId,
	DappSessionId,
	KeySourceId,
	WalletId,
} from "./identifiers";
import type { KeySourceRecord } from "./key-source";
import type { TimestampMs } from "./time";
import type { WalletRecord } from "./wallet";

export type AccountModelVersion = 1;

export type AccountModelState = {
	accountGroups: Record<AccountGroupId, AccountGroupRecord>;
	addresses: Record<AddressId, AddressRecord>;
	chainAccounts: Record<ChainAccountId, ChainAccountRecord>;
	dappSessions: Record<DappSessionId, DappSessionRecord>;
	keySources: Record<KeySourceId, KeySourceRecord>;
	selectedAccountGroupId?: AccountGroupId;
	updatedAt: TimestampMs;
	version: AccountModelVersion;
	wallets: Record<WalletId, WalletRecord>;
};
