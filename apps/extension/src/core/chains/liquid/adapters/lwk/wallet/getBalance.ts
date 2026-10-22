import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import { getLwkImplementation } from "./getLwkImplementation";
import { readOwnedWalletUtxos, sumByAsset } from "./readOwnedWalletUtxos";

export function getWalletBalanceForAsset(account: LiquidWalletAccount, rawAssetId: string): string {
	const balances = sumByAsset(readOwnedWalletUtxos(getLwkImplementation(account).wollet));

	return (balances.get(rawAssetId) ?? 0n).toString();
}
