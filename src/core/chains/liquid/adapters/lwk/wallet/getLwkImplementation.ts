import type { LiquidWalletAccount } from "../../../application/backends/LiquidWalletBackend";
import type { LwkLiquidAccountImplementation } from "../types";

export function getLwkImplementation(account: LiquidWalletAccount): LwkLiquidAccountImplementation {
	return account.implementation as LwkLiquidAccountImplementation;
}
