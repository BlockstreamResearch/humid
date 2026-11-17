import type { TransactionReceiptData } from "@/common/Confirmation/TransactionReceipt";

import { LIQUID_NATIVE_ASSET } from "../domain/LiquidAsset";
import { liquidExplorerTxUrl } from "../presentation/liquidExplorerTxUrl";
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

export async function transactionReceipt(
	context: Pick<LiquidRpcMethodContext, "chain" | "readPortfolioSnapshot">,
	account: LiquidWalletAccount,
	{
		changes,
		feeSats,
		txid,
	}: { changes: TransactionReceiptData["changes"]; feeSats: string; txid?: string },
): Promise<TransactionReceiptData> {
	return {
		assets: await readKnownAssets(context, account),
		changes,
		explorerUrl:
			txid === undefined ? undefined : (liquidExplorerTxUrl(context.chain, txid) ?? undefined),
		fee: `${feeSats} sats`,
		network: context.chain.name,
		txid,
	};
}
