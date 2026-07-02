import type {
	LiquidActivityEntry,
	LiquidWalletAccount,
} from "../../../application/backends/LiquidWalletBackend";
import { getLwkImplementation } from "./getLwkImplementation";
import { readWalletActivityForAsset } from "./readWalletData";

export function getWalletActivityForAsset(
	account: LiquidWalletAccount,
	rawAssetId: string,
): LiquidActivityEntry[] {
	return readWalletActivityForAsset(getLwkImplementation(account).wollet, rawAssetId);
}
