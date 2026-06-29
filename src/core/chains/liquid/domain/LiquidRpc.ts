import type { LiquidAssetId } from "./LiquidAsset";
import type { LiquidChainId } from "./LiquidChain";

export const LIQUID_WALLET_RPC_METHODS = {
	GET_BALANCE: "getBalance",
	GET_IDENTITY_PUBLIC_KEY: "getIdentityPublicKey",
	GET_IDENTITY_SHARED_KEY: "getIdentitySharedKey",
	GET_UTXOS: "getUTXOs",
	GET_WALLET_DESCRIPTOR: "getWalletDescriptor",
	PROCESS_CONFIDENTIAL_TRANSACTION: "processConfidentialTransaction",
	SEND_TRANSFER: "sendTransfer",
	SIGN_IDENTITY: "signIdentity",
	SIGN_MESSAGE: "signMessage",
	SIGN_PSET: "signPset",
} as const;

export const LIQUID_WALLETCONNECT_METHODS = [LIQUID_WALLET_RPC_METHODS.GET_BALANCE] as const;

export const LIQUID_WALLETCONNECT_EVENTS = [] as const;

export const LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT = "bip122_walletDescriptorChanged";

export type LiquidWalletConnectMethod = (typeof LIQUID_WALLETCONNECT_METHODS)[number];

export type LiquidWalletConnectEvent = (typeof LIQUID_WALLETCONNECT_EVENTS)[number];

export type LiquidGetBalanceParams = {
	assetId?: LiquidAssetId;
};

export type LiquidGetBalanceResult = {
	accountIdentifier: string;
	assetId: LiquidAssetId;
	balance: string;
	chainId: LiquidChainId;
	policyAssetId: LiquidAssetId;
};
