import type { KeySourceId } from "@/core/accounts/application/account-registry/model/identifiers";
import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";

import type { LiquidChainRecord } from "../../chains/LiquidChainRecord";
import type { LiquidAssetId, LiquidAssetMetadata } from "../../domain/LiquidAsset";
import type { LiquidChainId } from "../../domain/LiquidChain";
import type {
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
	accountIdentifier: string;
	chain: LiquidChainRecord;
	chainId: LiquidChainId;
	/** The watch-only descriptor string — safe to hand to the scan worker (no keys). */
	descriptor: string;
	dwid: string;
	implementation: unknown;
	policyAssetId: LiquidAssetId;
	rawPolicyAssetId: string;
};

export type ResolveLiquidWalletAccountInput = {
	/** Which account group (its HD `groupIndex`) to derive; defaults to 0 (the first). */
	accountGroupIndex?: number;
	chain: LiquidChainRecord;
	keyManagerState: KeyManagerState;
	/** The wallet's key source whose seed to derive from; defaults to the local root. */
	keySourceId?: KeySourceId;
	updateKeyManagerState?: UpdateKeyManagerState;
};

/** One wallet-relevant transaction for an asset, derived from the LWK tx history. */
export type LiquidActivityEntry = {
	amountSats: string;
	direction: "received" | "sent";
	timestamp: number | null;
	txid: string;
};

/** One asset the wallet holds: its raw id, balance (base units), and display metadata. */
export type LiquidAssetBalance = {
	amountSats: string;
	decimals: number;
	isNative: boolean;
	metadata: LiquidAssetMetadata;
	name: string;
	rawAssetId: string;
	symbol: string;
};

/** One transaction's net effect on the wallet, with a signed base-unit delta per asset. */
export type LiquidWalletTx = {
	deltas: { amountSats: string; rawAssetId: string }[];
	feeSats: string;
	timestamp: number | null;
	txid: string;
};

/** The native asset's fiat price from LWK's price feed (issued assets have no direct rate). */
export type LiquidFiatRate = {
	currency: string;
	nativeUnitPrice: string;
};

/** The full wallet read after a scan: asset balances, transaction history, and the fiat rate. */
export type LiquidWalletSnapshot = {
	activity: LiquidWalletTx[];
	assets: LiquidAssetBalance[];
	rate: LiquidFiatRate | null;
};

export type LiquidWalletBackend = {
	getActivity: (account: LiquidWalletAccount, rawAssetId: string) => LiquidActivityEntry[];
	getBalance: (account: LiquidWalletAccount, rawAssetId: string) => string;
	getReceiveAddress: (account: LiquidWalletAccount) => { address: string; index: number };
	getDescriptorEntries: (
		account: LiquidWalletAccount,
		params: LiquidGetWalletDescriptorParams,
	) => Promise<LiquidWalletDescriptorEntry[]>;
	getUtxos: (account: LiquidWalletAccount, rawAssetId: string) => LiquidUTXO[];
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
