import type { ChainGroup } from "@/core/chains/application/ChainGroup";
import type { LiquidWalletRpcContext } from "@/core/chains/liquid/application/createLiquidRpcRouter";

import type {
	LiquidActivityPage,
	LiquidAssetBalance,
	LiquidUtxoSnapshot,
	ResolveLiquidWalletAccountInput,
} from "./application/backends/LiquidWalletBackend";
import type { LiquidChainRecord } from "./chains/LiquidChainRecord";
import type { LiquidSendTransferResult, LiquidTransferReview } from "./domain/LiquidRpc";

/** A materialized receive address for display (the wallet's last unused address). */
export type LiquidReceiveAddress = {
	address: string;
	index: number;
};

/** The account's asset balances and raw UTXO set for one chain (activity is fetched apart, on demand). */
export type LiquidPortfolio = {
	assets: LiquidAssetBalance[];
	utxos: LiquidUtxoSnapshot[];
};

/** A watch-only scan target: chain config + public descriptor, no keys — safe to cache/persist. */
export type LiquidScanTarget = {
	chain: LiquidChainRecord;
	descriptor: string;
};

/**
 * A popup-initiated transfer request for the selected account. `amount` is a raw base-unit string
 * (the input parses the user's human amount into base units) and `rawAssetId` is the raw hex asset
 * id — omitted for the native policy asset (L-BTC), which the runtime resolves from the account. The
 * popup UI is the review+confirm step, so this bypasses the dapp `confirm` round-trip entirely.
 */
export type LiquidPopupTransferInput = {
	amount: string;
	rawAssetId?: string;
	recipientAddress: string;
};

/** Popup-facing account operations that need the LWK runtime (materialize + derive). */
export type LiquidAccountRuntime = {
	getActivity: (
		input: ResolveLiquidWalletAccountInput,
		rawAssetId: string,
		cursor: string | null,
	) => Promise<LiquidActivityPage>;
	getReceiveAddress: (input: ResolveLiquidWalletAccountInput) => Promise<LiquidReceiveAddress>;
	/**
	 * Preview a transfer for the selected account: validate the recipient and resolve the asset,
	 * WITHOUT signing or broadcasting. Returns the recipient's confidentiality (ELIP-1) so the popup
	 * can warn before an unconfidential send. Calls the same backend `inspectTransfer` the dapp uses.
	 */
	inspectTransfer: (
		input: ResolveLiquidWalletAccountInput,
		transfer: LiquidPopupTransferInput,
	) => Promise<LiquidTransferReview>;
	/** The ELIP-1 account id (`chain_id:dwid`) for the derived account. Needs the unlocked vault. */
	resolveAccountIdentifier: (input: ResolveLiquidWalletAccountInput) => Promise<string>;
	/** Derive the account's watch-only scan target (chain + descriptor). Needs the unlocked vault. */
	resolveScanTarget: (input: ResolveLiquidWalletAccountInput) => Promise<LiquidScanTarget>;
	/** Scan a watch-only target into a portfolio — vault-independent (no keys needed). */
	scanPortfolio: (target: LiquidScanTarget) => Promise<LiquidPortfolio>;
	/**
	 * Build, sign, and broadcast a transfer from the selected account, returning the broadcast txid.
	 * Syncs the account's wallet first (so the build has UTXOs), then calls the same backend
	 * `sendTransfer` the dapp uses — the signing/broadcast path is unchanged.
	 */
	sendTransfer: (
		input: ResolveLiquidWalletAccountInput,
		transfer: LiquidPopupTransferInput,
	) => Promise<LiquidSendTransferResult>;
};

export type LiquidChainGroup = ChainGroup<LiquidWalletRpcContext, LiquidChainRecord> & {
	accountRuntime: LiquidAccountRuntime;
};
