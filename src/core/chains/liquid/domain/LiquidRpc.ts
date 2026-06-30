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

export const LIQUID_WALLETCONNECT_METHODS = [
	LIQUID_WALLET_RPC_METHODS.GET_BALANCE,
	LIQUID_WALLET_RPC_METHODS.GET_UTXOS,
	LIQUID_WALLET_RPC_METHODS.GET_WALLET_DESCRIPTOR,
	LIQUID_WALLET_RPC_METHODS.GET_IDENTITY_PUBLIC_KEY,
	LIQUID_WALLET_RPC_METHODS.GET_IDENTITY_SHARED_KEY,
	LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
	LIQUID_WALLET_RPC_METHODS.SEND_TRANSFER,
	LIQUID_WALLET_RPC_METHODS.SIGN_IDENTITY,
	LIQUID_WALLET_RPC_METHODS.SIGN_MESSAGE,
	LIQUID_WALLET_RPC_METHODS.SIGN_PSET,
] as const;

export const LIQUID_WALLETCONNECT_EVENTS = [] as const;

export const LIQUID_WALLET_DESCRIPTOR_CHANGED_EVENT = "bip122_walletDescriptorChanged";

export type LiquidWalletConnectMethod = (typeof LIQUID_WALLETCONNECT_METHODS)[number];

export type LiquidWalletConnectEvent = (typeof LIQUID_WALLETCONNECT_EVENTS)[number];

export type LiquidGetBalanceParams = {
	assetId?: LiquidAssetId;
};

export type LiquidGetUTXOsParams = {
	assetId?: LiquidAssetId;
};

export const LIQUID_DESCRIPTOR_TYPES = {
	PUBLIC_CONFIDENTIAL_DESCRIPTOR: "publicConfidentialDescriptor",
	PUBLIC_WALLET_DESCRIPTOR: "publicWalletDescriptor",
} as const;

export const LIQUID_DESCRIPTOR_FORMATS = {
	BIP380_BIP389_MULTIPATH: "bip380-bip389-multipath",
	BIP380_SPLIT_BRANCHES: "bip380-split-branches",
	ELIP150_PUBLIC_CT_BIP389_MULTIPATH: "elip150-public-ct-bip389-multipath",
	ELIP150_PUBLIC_CT_SPLIT_BRANCHES: "elip150-public-ct-split-branches",
} as const;

export type LiquidDescriptorType =
	(typeof LIQUID_DESCRIPTOR_TYPES)[keyof typeof LIQUID_DESCRIPTOR_TYPES];

export type LiquidDescriptorFormat =
	(typeof LIQUID_DESCRIPTOR_FORMATS)[keyof typeof LIQUID_DESCRIPTOR_FORMATS];

export type LiquidGetWalletDescriptorParams = {
	descriptorFormat?: Array<{
		format: LiquidDescriptorFormat | string;
	}>;
	descriptorType: LiquidDescriptorType;
};

export type LiquidSendTransferParams = {
	account?: string;
	amount: string;
	assetId?: LiquidAssetId;
	memo?: string;
	recipientAddress: string;
};

export type LiquidGetBalanceResult = {
	accountIdentifier: string;
	assetId: LiquidAssetId;
	balance: string;
	chainId: LiquidChainId;
	policyAssetId: LiquidAssetId;
};

export type LiquidUTXO = {
	address: string;
	amount: string;
	assetId: LiquidAssetId;
	confidential: boolean;
	scriptPubKey: string;
	spendable: boolean;
	txid: string;
	txOut: string;
	vout: number;
};

export type LiquidGetUTXOsResult = {
	accountIdentifier: string;
	assetId: LiquidAssetId;
	chainId: LiquidChainId;
	policyAssetId: LiquidAssetId;
	utxos: LiquidUTXO[];
};

export type LiquidDescriptorBranch = {
	addressIndex: "*";
	branch: "external" | "internal";
	change: 0 | 1;
};

export type LiquidDescriptorBranchDescriptor = {
	branch: "external" | "internal";
	change: 0 | 1;
	descriptor: string;
};

export type LiquidWalletDescriptorEntry = {
	branchDescriptors?: LiquidDescriptorBranchDescriptor[];
	branches?: LiquidDescriptorBranch[];
	branchLayout: "multipath" | "split";
	canDeriveConfidentialAddresses: boolean;
	canDeriveScriptPubKeys: boolean;
	canUnblindOutputs: false;
	descriptor?: string;
	descriptorType: LiquidDescriptorType;
	format: LiquidDescriptorFormat;
	standardsUsed: string[];
};

export type LiquidGetWalletDescriptorResult = {
	accountIdentifier: string;
	chainId: LiquidChainId;
	descriptors: LiquidWalletDescriptorEntry[];
	policyAssetId: LiquidAssetId;
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

export type LiquidSendTransferResult = {
	txid: string;
};
