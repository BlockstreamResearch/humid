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
	/**
	 * The account group this chain account belongs to, threaded from the resolve input. Keys the
	 * persisted portfolio snapshot (`${accountGroupId}::${chainId}`) so a dapp read can serve from
	 * the cached snapshot instead of a live scan. Optional: internal callers that resolve without a
	 * group (the default account) leave it undefined, and the snapshot lookup is simply skipped.
	 */
	accountGroupId?: AccountGroupId;
	/**
	 * The BIP-85 index this account's keys derive at, threaded from the resolve input.
	 * Group 0 is the master seed's own account; group N derives a child mnemonic at N.
	 * Carried out of resolution so a caller that needs the account's own key material can
	 * derive it without re-deciding which group it is looking at.
	 */
	accountGroupIndex?: number;
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
	/** Network fee in base-unit sats (L-BTC), from the LWK WalletTx fee. */
	feeSats: string;
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
 * One wallet UTXO in raw base units — the Liquid-side mirror of the snapshot `PortfolioUtxo`
 * (structurally identical, kept decoupled the same way `LiquidAssetBalance` mirrors `PortfolioAsset`).
 * `rawAssetId` is the raw hex id and `amountSats` the base-unit string; the dapp `getUTXOs` mapping
 * adds the CAIP `assetId` on top of this.
 */
export type LiquidUtxoSnapshot = {
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
 * The wallet read after a scan: asset balances plus the raw UTXO set. Activity is not part of the
 * snapshot — it's read per-asset on demand (paginated), off the balance path.
 */
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
	getDescriptorEntries: (
		account: LiquidWalletAccount,
		params: LiquidGetWalletDescriptorParams,
	) => Promise<LiquidWalletDescriptorEntry[]>;
	getUtxos: (account: LiquidWalletAccount, rawAssetId: string) => LiquidUTXO[];
	/**
	 * The wallet's unspent outputs that hide nothing.
	 *
	 * Separate from `getUtxos` because the chain library does not report these as the
	 * wallet's at all, and because only one path can use them: a contract action cannot
	 * spend an output whose amount is hidden.
	 */
	getExplicitUtxos: (account: LiquidWalletAccount, rawAssetId: string) => LiquidUTXO[];
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
