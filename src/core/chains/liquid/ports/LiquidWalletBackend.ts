import type { KeyManagerState } from "@/core/key-manager/types";

import type { LiquidAssetId } from "../domain/LiquidAsset";
import type { LiquidChainId } from "../domain/LiquidChain";

export type LiquidWalletAccount = {
	accountIdentifier: string;
	chainId: LiquidChainId;
	dwid: string;
	implementation: unknown;
	policyAssetId: LiquidAssetId;
	rawPolicyAssetId: string;
};

export type ResolveLiquidWalletAccountInput = {
	chainId: LiquidChainId;
	keyManagerState: KeyManagerState;
};

export type LiquidWalletBackend = {
	getBalance: (account: LiquidWalletAccount, rawAssetId: string) => string;
	resolveAccount: (input: ResolveLiquidWalletAccountInput) => Promise<LiquidWalletAccount>;
	syncAccount: (account: LiquidWalletAccount) => Promise<void>;
};
