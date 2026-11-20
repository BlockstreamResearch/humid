import type {
	LiquidActivityEntry,
	LiquidWalletAccount,
} from "../../../application/backends/LiquidWalletBackend";
import { getLwkImplementation } from "./getLwkImplementation";
import { readWalletActivity } from "./readWalletData";

export function getWalletActivityForAsset(
	account: LiquidWalletAccount,
	rawAssetId: string | null,
): LiquidActivityEntry[] {
	return readWalletActivity(getLwkImplementation(account).wollet, rawAssetId);
}
