import { LIQUID_NATIVE_ASSET } from "../domain/LiquidAsset";
import type { LiquidWalletAccount } from "./backends/LiquidWalletBackend";
import type { LiquidRpcMethodContext } from "./LiquidRpcContext";

export type KnownAsset = { decimals: number; ticker: string };

export function accountNameOf(
	context: Pick<LiquidRpcMethodContext, "keyManagerState">,
	account: LiquidWalletAccount,
): string {
	const group =
		account.accountGroupId === undefined
			? undefined
			: context.keyManagerState.accountModel.accountGroups[account.accountGroupId];

	return group?.name ?? `Account ${account.accountGroupIndex ?? 0}`;
}

export async function readKnownAssets(
	context: Pick<LiquidRpcMethodContext, "readPortfolioSnapshot">,
	account: LiquidWalletAccount,
): Promise<Record<string, KnownAsset>> {
	const snapshot =
		account.accountGroupId === undefined
			? null
			: await context.readPortfolioSnapshot?.(account.accountGroupId, account.chainId);
	const held = (snapshot?.data.assets ?? []).map(
		(asset) => [asset.rawAssetId, { decimals: asset.decimals, ticker: asset.symbol }] as const,
	);

	return {
		...Object.fromEntries(held),
		[account.rawPolicyAssetId]: {
			decimals: LIQUID_NATIVE_ASSET.decimals,
			ticker: LIQUID_NATIVE_ASSET.symbol,
		},
	};
}
