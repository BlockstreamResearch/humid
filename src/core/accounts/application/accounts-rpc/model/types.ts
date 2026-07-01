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

/** One transaction in the selected asset's history (chain-agnostic view). */
export type PortfolioActivityEntry = {
	amountSats: string;
	direction: "received" | "sent";
	timestamp: number | null;
	txid: string;
};

/**
 * The selected account+chain balance snapshot: the native asset and its activity.
 * Fiat prices and issued-asset metadata have no source yet, so this stays native-only.
 */
export type PortfolioSnapshot = {
	activity: PortfolioActivityEntry[];
	native: {
		amountSats: string;
		decimals: number;
		name: string;
		rawAssetId: string;
		symbol: string;
	};
};
