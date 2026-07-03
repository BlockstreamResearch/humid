import type { AccountGroupRecord } from "../../account-registry/model/account-group";
import type { AccountGroupId } from "../../account-registry/model/identifiers";

/** The popup's view of the account axis: the account groups and the selected one. */
export type AccountsState = {
	accountGroups: AccountGroupRecord[];
	selectedAccountGroupId: AccountGroupId;
};

export type SetSelectedAccountInput = {
	accountGroupId: AccountGroupId;
};

export type RenameAccountInput = {
	accountGroupId: AccountGroupId;
	name: string;
};

/** Derive a new account (next index) on the current wallet's seed. */
export type CreateAccountInput = {
	name?: string;
};

/** Import a new wallet from a BIP-39 recovery phrase. */
export type ImportAccountInput = {
	mnemonic: string;
	name?: string;
};

export type RemoveAccountInput = {
	accountGroupId: AccountGroupId;
};

export type RevealRecoveryPhraseInput = {
	accountGroupId: AccountGroupId;
};

/** The recovery phrase (BIP-39 mnemonic) backing an account's wallet. Sensitive. */
export type RecoveryPhrase = {
	phrase: string;
};

/** A materialized receive address for the selected account on the selected chain. */
export type ReceiveAddress = {
	address: string;
	index: number;
};

/** One asset the account holds on the selected chain: balance (base units) + display metadata. */
export type PortfolioAsset = {
	amountSats: string;
	decimals: number;
	isNative: boolean;
	/** Chain-specific display blob, rendered by the owning chain group's presentation. */
	metadata: unknown;
	name: string;
	rawAssetId: string;
	symbol: string;
};

/**
 * The selected account+chain wallet contents: every asset balance. Issued-asset names come from
 * the registry when available. Activity is not part of this — it's fetched per asset on demand via
 * `getActivity`, off the balance poll.
 */
export type PortfolioData = {
	assets: PortfolioAsset[];
};

/** One transaction in an asset's history (that asset's signed net effect). */
export type ActivityEntry = {
	amountSats: string;
	direction: "received" | "sent";
	timestamp: number | null;
	txid: string;
};

/** One page of an asset's activity plus the opaque cursor for the next page (null at the end). */
export type ActivityPage = {
	items: ActivityEntry[];
	nextCursor: string | null;
};

/** Read one page of an asset's activity for the selected account+chain (null cursor = first page). */
export type GetActivityInput = {
	cursor: string | null;
	rawAssetId: string;
};

/**
 * The background's cached view of the selected account+chain portfolio. Reads return the
 * last successfully synced `data` (null before the first sync) instantly while the
 * background (re)syncs the wallet in a worker: `isSyncing` reflects that live state and
 * `error` carries the last sync failure (with `data` possibly stale or still null).
 */
export type PortfolioSnapshot = {
	data: PortfolioData | null;
	error: string | null;
	isSyncing: boolean;
	syncedAt: number | null;
};
