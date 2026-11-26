import {
	LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT,
	type LiquidSendTransferParams,
} from "@humid/wallet-rpc";

import type { LiquidAssetId } from "./LiquidAsset";
import type { LiquidChainId } from "./LiquidChain";

export {
	LIQUID_DESCRIPTOR_FORMATS,
	LIQUID_DESCRIPTOR_TYPES,
	LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT,
	LIQUID_WALLET_RPC_METHODS,
} from "@humid/wallet-rpc";
export type {
	LiquidDescriptorBranch,
	LiquidDescriptorBranchDescriptor,
	LiquidDescriptorFormat,
	LiquidDescriptorType,
	LiquidGetAddressResult,
	LiquidGetBalanceResult,
	LiquidGetUTXOsResult,
	LiquidGetWalletDescriptorParams,
	LiquidGetWalletDescriptorResult,
	LiquidSendTransferParams,
	LiquidSendTransferResult,
	LiquidTxOutCommitments,
	LiquidUTXO,
	LiquidWalletDescriptorEntry,
} from "@humid/wallet-rpc";

export const LIQUID_WALLETCONNECT_EVENTS = [
	"accountsChanged",
	"chainChanged",
	LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT,
] as const;

export type LiquidWalletConnectEvent = (typeof LIQUID_WALLETCONNECT_EVENTS)[number];

export type ParsedLiquidGetAddressParams = {
	confidential: boolean;
	index: number;
};

export type ParsedLiquidGetBalanceParams = {
	assetId?: LiquidAssetId;
};

export type ParsedLiquidGetUTXOsParams = {
	assetId?: LiquidAssetId;
};

export type ParsedLiquidSendTransferParams = Omit<LiquidSendTransferParams, "assetId"> & {
	assetId?: LiquidAssetId;
	/** Set only by the wallet's own send screen, never parsed from a dapp. */
	sendAll?: boolean;
};

export type LiquidEstimateMaxSendParams = {
	recipientAddress: string;
};

export type LiquidEstimateMaxSendResult = {
	feeSats: string;
	maxAmount: string;
};

export type LiquidTransferReview = {
	accountIdentifier: string;
	amount: string;
	assetId: LiquidAssetId;
	chainId: LiquidChainId;
	memo?: string;
	policyAssetId: LiquidAssetId;
	recipientAddress: string;
	recipientConfidential: boolean;
};

export type LiquidTransferFee = {
	feeRateSatsPerKvb: number;
	feeSats: string;
};

export type LiquidTransferQuote = LiquidTransferFee & {
	amount: string;
};
