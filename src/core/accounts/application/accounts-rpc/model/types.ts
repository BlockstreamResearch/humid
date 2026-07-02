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

/** One transaction's net effect, with a signed base-unit delta per affected asset. */
export type PortfolioTxEntry = {
	deltas: { amountSats: string; rawAssetId: string }[];
	feeSats: string;
	timestamp: number | null;
	txid: string;
};

/** The native asset's fiat price (issued assets have no direct rate; null if unavailable). */
export type PortfolioRate = {
	currency: string;
	nativeUnitPrice: string;
};

/**
 * The selected account+chain wallet contents: every asset balance, the transaction history,
 * and the native asset's fiat rate. Issued-asset fiat has no source, so only the native asset
 * is priced; issued-asset names come from the registry when available.
 */
export type PortfolioData = {
	activity: PortfolioTxEntry[];
	assets: PortfolioAsset[];
	rate: PortfolioRate | null;
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
