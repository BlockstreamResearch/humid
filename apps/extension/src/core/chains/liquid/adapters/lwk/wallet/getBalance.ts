import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { getLwkImplementation } from "./getLwkImplementation";
import { readWalletBalanceForAsset } from "./readWalletData";

export function getWalletBalanceForAsset(account: LiquidWalletAccount, rawAssetId: string): string {
	return readWalletBalanceForAsset(
		getLwkImplementation(account).wollet,
		account.chainId,
		rawAssetId,
	);
}
