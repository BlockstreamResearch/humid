import type {
	AccountGroupId,
	KeySourceId,
} from "@/core/accounts/application/account-registry/model/identifiers";
import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";

import type { LiquidChainRecord } from "../../chains/LiquidChainRecord";
import type { LiquidAssetId, LiquidAssetMetadata } from "../../domain/LiquidAsset";
import type { LiquidChainId } from "../../domain/LiquidChain";
import type {
	LiquidEstimateMaxSendParams,
	LiquidEstimateMaxSendResult,
	LiquidGetWalletDescriptorParams,
	ParsedLiquidSendTransferParams,
	LiquidSendTransferResult,
	LiquidTransferFee,
	LiquidTransferQuote,
	LiquidTransferReview,
	LiquidUTXO,
	LiquidWalletDescriptorEntry,
} from "../../domain/LiquidRpc";
import type {
	LiquidSignMessageResult,
	LiquidSignMessageReview,
	ParsedLiquidSignMessageParams,
} from "../../domain/message/types";
import type {
	LiquidSignPsetResult,
	LiquidSignPsetReview,
	ReviewedLiquidSignPsetParams,
} from "../../domain/pset/types";
import type { SignedHold, TransactionNote } from "../signedHold";

export type LiquidWalletAccount = {
	accountGroupId?: AccountGroupId;
	accountGroupIndex?: number;
	accountIdentifier: string;
	keySourceId?: KeySourceId;
	chain: LiquidChainRecord;
	chainId: LiquidChainId;
	descriptor: string;
	dwid: string;
	implementation: unknown;
	policyAssetId: LiquidAssetId;
	rawPolicyAssetId: string;
};

export type ResolveLiquidWalletAccountInput = {
	accountGroupId?: AccountGroupId;
	accountGroupIndex?: number;
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	keySourceId?: KeySourceId;
	updateKeyManagerState?: UpdateKeyManagerState;
};

export type LiquidActivityEntry = {
	/** Signed: what the transaction added to or took from this account, per asset. */
	changes: { amountSats: string; rawAssetId: string }[];
	feeSats: string;
	timestamp: number | null;
	txid: string;
};

export type LiquidActivityPage = {
	items: LiquidActivityEntry[];
	nextCursor: string | null;
};

export type LiquidAssetBalance = {
	amountSats: string;
	decimals: number;
	isNative: boolean;
	metadata: LiquidAssetMetadata;
	name: string;
	rawAssetId: string;
	symbol: string;
};

export type LiquidBlindingSecrets = {
	asset: string;
	assetBlindingFactor: string;
	value: number;
	valueBlindingFactor: string;
};

export type LiquidUtxoSnapshot = {
	address: string;
	amountSats: string;
	blindingSecrets?: LiquidBlindingSecrets;
	confidential: boolean;
	derivationPath?: string;
	rawAssetId: string;
	scriptPubKey: string;
	spendable: boolean;
	txid: string;
	txOut: string;
	vout: number;
};

/**
 * A wallet output the contract flow may fund from, with what the signing module needs.
 *
 * This never leaves the wallet. `LiquidUTXO` is what a dapp is answered with.
 */
export type LiquidFundingUtxo = LiquidUTXO & {
	blindingSecrets?: LiquidBlindingSecrets;
	derivationPath?: string;
};

export type LiquidWalletSnapshot = {
	assets: LiquidAssetBalance[];
	utxos: LiquidUtxoSnapshot[];
};

export type LiquidWalletBackend = {
	estimateMaxSend: (
		account: LiquidWalletAccount,
		params: LiquidEstimateMaxSendParams,
		rawAssetId: string,
	) => Promise<LiquidEstimateMaxSendResult>;
	getActivity: (account: LiquidWalletAccount, rawAssetId: string | null) => LiquidActivityEntry[];
	getAddress: (
		account: LiquidWalletAccount,
		index: number,
	) => { address: string; explicit: string };
	getBalance: (account: LiquidWalletAccount, rawAssetId: string) => string;
	getReceiveAddress: (account: LiquidWalletAccount) => { address: string; index: number };
	getSigningAddress: (account: LiquidWalletAccount) => {
		address: string;
		index: number;
		explicit: string;
	};
	getDescriptorEntries: (
		account: LiquidWalletAccount,
		params: LiquidGetWalletDescriptorParams,
	) => Promise<LiquidWalletDescriptorEntry[]>;
	getUtxos: (account: LiquidWalletAccount, rawAssetId: string) => LiquidUTXO[];
	getExplicitUtxos: (account: LiquidWalletAccount, rawAssetId: string) => LiquidUTXO[];
	getFundingUtxos: (account: LiquidWalletAccount, rawAssetId: string) => LiquidFundingUtxo[];
	getTipHeight: (account: LiquidWalletAccount) => number;
	inspectTransfer: (
		account: LiquidWalletAccount,
		params: ParsedLiquidSendTransferParams,
		rawAssetId: string,
	) => Promise<LiquidTransferReview>;
	inspectMessageSigning: (
		account: LiquidWalletAccount,
		params: ParsedLiquidSignMessageParams,
	) => Promise<LiquidSignMessageReview>;
	resolveAccount: (input: ResolveLiquidWalletAccountInput) => Promise<LiquidWalletAccount>;
	quoteTransfer: (
		account: LiquidWalletAccount,
		params: ParsedLiquidSendTransferParams,
		rawAssetId: string,
		feeRateSatsPerKvb: number,
	) => Promise<LiquidTransferQuote>;
	sendTransfer: (
		account: LiquidWalletAccount,
		params: ParsedLiquidSendTransferParams,
		rawAssetId: string,
		fee?: LiquidTransferFee,
		note?: TransactionNote,
	) => Promise<LiquidSendTransferResult>;
	signMessage: (
		account: LiquidWalletAccount,
		params: ParsedLiquidSignMessageParams,
	) => Promise<LiquidSignMessageResult>;
	blindAndInspectPset: (
		account: LiquidWalletAccount,
		psetBase64: string,
	) => Promise<LiquidSignPsetReview>;
	signPset: (
		account: LiquidWalletAccount,
		params: ReviewedLiquidSignPsetParams,
		signedFor: SignedHold,
	) => Promise<LiquidSignPsetResult>;
	syncAccount: (account: LiquidWalletAccount) => Promise<void>;
};
