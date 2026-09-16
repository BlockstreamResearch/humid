import type { ChainGroup } from "@/core/chains/application/ChainGroup";
import type { LiquidWalletRpcContext } from "@/core/chains/liquid/application/createLiquidRpcRouter";

import type {
	LiquidActivityPage,
	LiquidAssetBalance,
	LiquidUtxoSnapshot,
	ResolveLiquidWalletAccountInput,
} from "./application/backends/LiquidWalletBackend";
import type { LiquidChainRecord } from "./chains/LiquidChainRecord";
import type {
	LiquidEstimateMaxSendResult,
	LiquidSendTransferResult,
	LiquidTransferReview,
} from "./domain/LiquidRpc";

export type LiquidReceiveAddress = {
	address: string;
	index: number;
	unconfidential: string;
};

export type LiquidPortfolio = {
	assets: LiquidAssetBalance[];
	utxos: LiquidUtxoSnapshot[];
};

export type LiquidScanTarget = {
	chain: LiquidChainRecord;
	descriptor: string;
};

export type LiquidPopupTransferInput = {
	amount: string;
	rawAssetId?: string;
	recipientAddress: string;
	sendAll?: boolean;
};

export type LiquidPopupEstimateMaxSendInput = {
	rawAssetId?: string;
	recipientAddress: string;
};

export type LiquidAccountRuntime = {
	estimateMaxSend: (
		input: ResolveLiquidWalletAccountInput,
		estimate: LiquidPopupEstimateMaxSendInput,
	) => Promise<LiquidEstimateMaxSendResult>;
	getActivity: (
		input: ResolveLiquidWalletAccountInput,
		rawAssetId: string,
		cursor: string | null,
	) => Promise<LiquidActivityPage>;
	getReceiveAddress: (input: ResolveLiquidWalletAccountInput) => Promise<LiquidReceiveAddress>;
	inspectTransfer: (
		input: ResolveLiquidWalletAccountInput,
		transfer: LiquidPopupTransferInput,
	) => Promise<LiquidTransferReview>;
	resolveAccountIdentifier: (input: ResolveLiquidWalletAccountInput) => Promise<string>;
	resolveScanTarget: (input: ResolveLiquidWalletAccountInput) => Promise<LiquidScanTarget>;
	scanPortfolio: (target: LiquidScanTarget) => Promise<LiquidPortfolio>;
	sendTransfer: (
		input: ResolveLiquidWalletAccountInput,
		transfer: LiquidPopupTransferInput,
	) => Promise<LiquidSendTransferResult>;
};

export type LiquidChainGroup = ChainGroup<LiquidWalletRpcContext, LiquidChainRecord> & {
	accountRuntime: LiquidAccountRuntime;
};
