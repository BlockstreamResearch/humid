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
	LiquidSendTransferParams,
	LiquidSendTransferResult,
	LiquidTransferReview,
	LiquidUTXO,
	LiquidWalletDescriptorEntry,
} from "../../domain/LiquidRpc";
import type {
	LiquidSignMessageResult,
	LiquidSignMessageReview,
	ParsedLiquidSignMessageParams,
} from "../../domain/message/types";
import type { LiquidSignPsetResult, ParsedLiquidSignPsetParams } from "../../domain/pset/types";

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
	amountSats: string;
	direction: "received" | "sent";
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
	getActivity: (account: LiquidWalletAccount, rawAssetId: string) => LiquidActivityEntry[];
	getBalance: (account: LiquidWalletAccount, rawAssetId: string) => string;
	getReceiveAddress: (account: LiquidWalletAccount) => { address: string; index: number };
	getSigningAddress: (account: LiquidWalletAccount) => {
		address: string;
		index: number;
		unconfidential: string;
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
		params: LiquidSendTransferParams,
		rawAssetId: string,
	) => Promise<LiquidTransferReview>;
	inspectMessageSigning: (
		account: LiquidWalletAccount,
		params: ParsedLiquidSignMessageParams,
	) => Promise<LiquidSignMessageReview>;
	resolveAccount: (input: ResolveLiquidWalletAccountInput) => Promise<LiquidWalletAccount>;
	sendTransfer: (
		account: LiquidWalletAccount,
		params: LiquidSendTransferParams,
		rawAssetId: string,
	) => Promise<LiquidSendTransferResult>;
	signMessage: (
		account: LiquidWalletAccount,
		params: ParsedLiquidSignMessageParams,
	) => Promise<LiquidSignMessageResult>;
	signPset: (
		account: LiquidWalletAccount,
		params: ParsedLiquidSignPsetParams,
	) => Promise<LiquidSignPsetResult>;
	syncAccount: (account: LiquidWalletAccount) => Promise<void>;
};
