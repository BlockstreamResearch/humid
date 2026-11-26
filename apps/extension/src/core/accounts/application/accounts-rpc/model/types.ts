import type { AccountGroupRecord } from "../../account-registry/model/account-group";
import type { AccountGroupId, WalletId } from "../../account-registry/model/identifiers";

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

export type CreateAccountInput = {
	name?: string;
};

export type ImportAccountInput = {
	mnemonic: string;
	name?: string;
};

export type RemoveAccountInput = {
	accountGroupId: AccountGroupId;
};

export type RemoveWalletInput = {
	walletId: WalletId;
};

export type RevealRecoveryPhraseInput = {
	accountGroupId: AccountGroupId;
	passphrase: string;
};

export type RecoveryPhrase = {
	phrase: string;
};

export type HeldTransaction = {
	action: string;
	at: number;
	holding: { amountSats: string; rawAssetId: string }[];
	origin: string;
	txid: string;
};

export type ReceiveAddress = {
	address: string;
	index: number;
	explicit: string;
};

export type TransferFee = {
	feeRateSatsPerKvb: number;
	feeSats: string;
};

export type TransferQuote = TransferFee & {
	amount: string;
	targetBlocks: number;
};

export type SendTransferInput = {
	amount: string;
	fee?: TransferFee;
	rawAssetId?: string;
	recipientAddress: string;
	sendAll?: boolean;
};

export type EstimateMaxSendInput = {
	rawAssetId?: string;
	recipientAddress: string;
};

export type EstimateMaxSendResult = {
	feeSats: string;
	maxAmount: string;
};

export type TransferReview = {
	amount: string;
	assetId: string;
	quotes: TransferQuote[];
	recipientAddress: string;
	recipientConfidential: boolean;
};

export type SendTransferResult = {
	txid: string;
};

export type PortfolioAsset = {
	amountSats: string;
	decimals: number;
	isNative: boolean;
	metadata: unknown;
	name: string;
	rawAssetId: string;
	symbol: string;
};

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

export type PortfolioData = {
	assets: PortfolioAsset[];
	utxos: PortfolioUtxo[];
};

export type ActivityEntry = {
	/** Signed: what the transaction added to or took from this account, per asset. */
	changes: { amountSats: string; rawAssetId: string }[];
	feeSats: string;
	label?: { action: string; origin: string };
	timestamp: number | null;
	txid: string;
};

export type ActivityPage = {
	items: ActivityEntry[];
	nextCursor: string | null;
};

export type GetActivityInput = {
	cursor: string | null;
	rawAssetId: string | null;
};

export type PortfolioSnapshot = {
	data: PortfolioData | null;
	error: string | null;
	isSyncing: boolean;
	syncedAt: number | null;
};
