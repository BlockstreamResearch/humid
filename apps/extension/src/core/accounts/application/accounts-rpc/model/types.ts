import type { AccountGroupRecord } from "../../account-registry/model/account-group";
import type { AccountGroupId, WalletId } from "../../account-registry/model/identifiers";

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

/** Forget an entire wallet: all its accounts, their cached data, and its plaintext seed. */
export type RemoveWalletInput = {
	walletId: WalletId;
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

/**
 * A popup-initiated transfer for the selected account+chain. `amount` is a raw base-unit string (the
 * Send form parses the user's human amount into base units at the input boundary); `rawAssetId` is
 * the raw hex asset id, omitted for the native policy asset (L-BTC). Shared by the preview and send.
 */
export type SendTransferInput = {
	amount: string;
	rawAssetId?: string;
	recipientAddress: string;
};

/**
 * A transfer preview (no signing/broadcast): the resolved recipient, amount, and asset, plus the
 * recipient's confidentiality per ELIP-1 — `recipientConfidential: false` means the popup should warn
 * that confidentiality will be lost before confirming.
 */
export type TransferReview = {
	amount: string;
	assetId: string;
	recipientAddress: string;
	recipientConfidential: boolean;
};

/** The result of a broadcast transfer: the on-chain transaction id. */
export type SendTransferResult = {
	txid: string;
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
 * One wallet UTXO in raw base units, mirroring the ELIP-1 `getUTXOs` entry shape but keeping the
 * repo's snapshot conventions: the asset is the raw hex id (`rawAssetId`, not the CAIP `assetId`)
 * and the amount is a base-unit string (`amountSats`, same representation as `PortfolioAsset`), so
 * the CAIP formatting stays a render/serve-time concern. Persisted with the snapshot so a later
 * step can serve the dapp `getUTXOs` RPC from here instead of a live LWK scan.
 */
export type PortfolioUtxo = {
	address: string;
	amountSats: string;
	confidential: boolean;
	rawAssetId: string;
	scriptPubKey: string;
	spendable: boolean;
	txid: string;
	txOut: string;
	vout: number;
};

/**
 * The selected account+chain wallet contents: every asset balance plus the raw UTXO set. Issued-asset
 * names come from the registry when available. Activity is not part of this — it's fetched per asset
 * on demand via `getActivity`, off the balance poll. The popup reads only `assets`; `utxos` exists to
 * back the dapp `getUTXOs`/`getBalance` RPCs from the persisted snapshot.
 */
export type PortfolioData = {
	assets: PortfolioAsset[];
	utxos: PortfolioUtxo[];
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
