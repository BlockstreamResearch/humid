import type { ChainGroup } from "@/core/chains/application/ChainGroup";
import type { LiquidWalletRpcContext } from "@/core/chains/liquid/application/createLiquidRpcRouter";

import type {
	LiquidAssetBalance,
	LiquidFiatRate,
	LiquidWalletTx,
	ResolveLiquidWalletAccountInput,
} from "./application/backends/LiquidWalletBackend";
import type { LiquidChainRecord } from "./chains/LiquidChainRecord";

/** A materialized receive address for display (the wallet's last unused address). */
export type LiquidReceiveAddress = {
	address: string;
	index: number;
};

/** The account's asset balances, transaction history, and native fiat rate for one chain. */
export type LiquidPortfolio = {
	activity: LiquidWalletTx[];
	assets: LiquidAssetBalance[];
	rate: LiquidFiatRate | null;
};

/** Popup-facing account operations that need the LWK runtime (materialize + derive). */
export type LiquidAccountRuntime = {
	getPortfolio: (input: ResolveLiquidWalletAccountInput) => Promise<LiquidPortfolio>;
	getReceiveAddress: (input: ResolveLiquidWalletAccountInput) => Promise<LiquidReceiveAddress>;
};

export type LiquidChainGroup = ChainGroup<LiquidWalletRpcContext, LiquidChainRecord> & {
	accountRuntime: LiquidAccountRuntime;
};
