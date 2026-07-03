import type {
	AccountGroupId,
	KeySourceId,
} from "@/core/accounts/application/account-registry/model/identifiers";
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
	/**
	 * Which account group the derived chain account belongs to, so `ensureChainAccount` keys the
	 * materialized account to the right group. Without it, persistence defaults to the *selected*
	 * group — so materializing a non-selected group (multi-account connect, or a dapp call on a
	 * non-selected authorized account) collides with the selected group's chain account on that chain.
	 */
	accountGroupId?: AccountGroupId;
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

/** One page of an asset's activity plus the opaque cursor for the next page (null at the end). */
export type LiquidActivityPage = {
	items: LiquidActivityEntry[];
	nextCursor: string | null;
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

/**
 * The wallet read after a scan: asset balances. Activity is not part of the snapshot — it's read
 * per-asset on demand (paginated), off the balance path.
 */
export type LiquidWalletSnapshot = {
	assets: LiquidAssetBalance[];
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
