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

/** Popup-facing account operations that need the LWK runtime (materialize + derive). */
export type LiquidAccountRuntime = {
	getActivity: (
		input: ResolveLiquidWalletAccountInput,
		rawAssetId: string,
		cursor: string | null,
	) => Promise<LiquidActivityPage>;
	getPortfolio: (input: ResolveLiquidWalletAccountInput) => Promise<LiquidPortfolio>;
	getReceiveAddress: (input: ResolveLiquidWalletAccountInput) => Promise<LiquidReceiveAddress>;
};

export type LiquidChainGroup = ChainGroup<LiquidWalletRpcContext, LiquidChainRecord> & {
	accountRuntime: LiquidAccountRuntime;
};
