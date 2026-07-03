import type { ChainGroup } from "@/core/chains/application/ChainGroup";
import type { LiquidWalletRpcContext } from "@/core/chains/liquid/application/createLiquidRpcRouter";

import type {
	LiquidActivityPage,
	LiquidAssetBalance,
	ResolveLiquidWalletAccountInput,
} from "./application/backends/LiquidWalletBackend";
import type { LiquidChainRecord } from "./chains/LiquidChainRecord";

/** A materialized receive address for display (the wallet's last unused address). */
export type LiquidReceiveAddress = {
	address: string;
	index: number;
};

/** The account's asset balances for one chain (activity is fetched apart, on demand). */
export type LiquidPortfolio = {
	assets: LiquidAssetBalance[];
};

/** A watch-only scan target: chain config + public descriptor, no keys — safe to cache/persist. */
export type LiquidScanTarget = {
	chain: LiquidChainRecord;
	descriptor: string;
};

/** Popup-facing account operations that need the LWK runtime (materialize + derive). */
export type LiquidAccountRuntime = {
	getActivity: (
		input: ResolveLiquidWalletAccountInput,
		rawAssetId: string,
		cursor: string | null,
	) => Promise<LiquidActivityPage>;
	getReceiveAddress: (input: ResolveLiquidWalletAccountInput) => Promise<LiquidReceiveAddress>;
	/** The ELIP-1 account id (`chain_id:dwid`) for the derived account. Needs the unlocked vault. */
	resolveAccountIdentifier: (input: ResolveLiquidWalletAccountInput) => Promise<string>;
	/** Derive the account's watch-only scan target (chain + descriptor). Needs the unlocked vault. */
	resolveScanTarget: (input: ResolveLiquidWalletAccountInput) => Promise<LiquidScanTarget>;
	/** Scan a watch-only target into a portfolio — vault-independent (no keys needed). */
	scanPortfolio: (target: LiquidScanTarget) => Promise<LiquidPortfolio>;
};

export type LiquidChainGroup = ChainGroup<LiquidWalletRpcContext, LiquidChainRecord> & {
	accountRuntime: LiquidAccountRuntime;
};
