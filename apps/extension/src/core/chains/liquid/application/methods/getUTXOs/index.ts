import type { KeyManagerState, UpdateKeyManagerState } from "@/core/key-manager/types";
import { WALLET_CAPABILITY_GROUPS } from "@/core/wallet-methods/capability";
import { createWalletMethod } from "@/core/wallet-methods/createWalletMethod";
import type { WalletRpcConfirmationHandler } from "@/core/wallet-rpc/types";

import type { LiquidChainRecord } from "../../../chains/LiquidChainRecord";
import { restrictedLiquidAssetId, type ParsedLiquidAssetId } from "../../../domain/LiquidAsset";
import {
	LIQUID_WALLET_RPC_METHODS,
	type LiquidGetUTXOsParams,
	type LiquidGetUTXOsResult,
} from "../../../domain/LiquidRpc";
import { parseLiquidAssetId, parseLiquidGetUTXOsParams } from "../../../domain/validation";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../backends/LiquidWalletBackend";
import { mapLiquidUtxosForAsset } from "../../backends/mapLiquidUtxosForAsset";
import { resolveDappAccount } from "../../dappAccountScope";
import type { ReadPortfolioSnapshot } from "../../LiquidRpcContext";

export type LiquidGetUTXOsContext = {
	chain: LiquidChainRecord;
	confirm?: WalletRpcConfirmationHandler;
	keyManagerState: KeyManagerState;
	readPortfolioSnapshot?: ReadPortfolioSnapshot;
	updateKeyManagerState?: UpdateKeyManagerState;
	walletBackend: LiquidWalletBackend;
};

type LiquidGetUTXOsReview = {
	account: LiquidWalletAccount;
	requestedAsset: ParsedLiquidAssetId;
};

export const getLiquidUTXOs = createWalletMethod<
	LiquidGetUTXOsParams,
	LiquidGetUTXOsContext,
	LiquidGetUTXOsReview,
	LiquidGetUTXOsResult
>({
	capability: {
		access: "read",
		description: "See this account's individual coins (unspent outputs).",
		group: WALLET_CAPABILITY_GROUPS.VIEW_BALANCES,
		id: LIQUID_WALLET_RPC_METHODS.GET_UTXOS,
		label: "View coins",
		restricted: ({ context, params }) => ({
			accountIdentifier: "",
			assetId: params.assetId ?? restrictedLiquidAssetId(context.chain.id),
			chainId: context.chain.id,
			policyAssetId: restrictedLiquidAssetId(context.chain.id),
			utxos: [],
		}),
	},
	confirmation: ({ review }) => ({
		data: {
			accountIdentifier: review.account.accountIdentifier,
			assetId: review.requestedAsset.assetId,
			chainId: review.account.chainId,
			kind: "liquid.getUTXOs",
		},
		message: "A dapp wants to read the Liquid UTXOs for this account.",
		title: "Share Liquid UTXOs?",
	}),
	execute: async ({ context, review }) => {
		const { account, requestedAsset } = review;

		// Snapshot-first: when a persisted portfolio snapshot exists for this account+chain, serve the
		// UTXOs from it with no scan, via the SAME mapping the live scan path uses (so the two can't
		// drift). A miss (cold cache, or a non-selected account that has no snapshot) falls through to
		// the live scan below; reads never trigger a sync.
		if (context.readPortfolioSnapshot && account.accountGroupId) {
			const snapshot = await context.readPortfolioSnapshot(account.accountGroupId, account.chainId);

			if (snapshot) {
				return {
					accountIdentifier: account.accountIdentifier,
					assetId: requestedAsset.assetId,
					chainId: account.chainId,
					policyAssetId: account.policyAssetId,
					utxos: mapLiquidUtxosForAsset(snapshot.data.utxos, requestedAsset),
				};
			}
		}

		await context.walletBackend.syncAccount(account);

		return {
			accountIdentifier: account.accountIdentifier,
			assetId: requestedAsset.assetId,
			chainId: account.chainId,
			policyAssetId: account.policyAssetId,
			utxos: context.walletBackend.getUtxos(account, requestedAsset.rawAssetId),
		};
	},
	parse: parseLiquidGetUTXOsParams,
	review: async ({ context, params }) => {
		const account = await resolveDappAccount(context);

		return {
			account,
			requestedAsset: resolveRequestedAsset(params.assetId, account),
		};
	},
});

function resolveRequestedAsset(
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
