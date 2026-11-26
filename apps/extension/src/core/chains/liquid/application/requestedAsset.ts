import type { ParsedLiquidAssetId } from "../domain/LiquidAsset";
import { parseLiquidAssetId } from "../domain/validation";
import type { LiquidWalletAccount } from "./backends/LiquidWalletBackend";

/** The asset a request names, or the account's policy asset when it names none. */
export function resolveRequestedAsset(
	assetId: string | undefined,
	account: LiquidWalletAccount,
): ParsedLiquidAssetId {
	if (assetId) {
		return parseLiquidAssetId(assetId, account.chainId);
	}

	return {
		assetId: account.policyAssetId,
		chainId: account.chainId,
		rawAssetId: account.rawPolicyAssetId,
	};
}
