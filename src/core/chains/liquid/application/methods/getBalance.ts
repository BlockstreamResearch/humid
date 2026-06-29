import type { KeyManagerState } from "@/core/key-manager/types";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
	WalletRpcUserRejectedError,
} from "@/core/wallet-rpc/errors";

import type { ParsedLiquidAssetId } from "../../domain/LiquidAsset";
import type { LiquidChainId } from "../../domain/LiquidChain";
import type { LiquidGetBalanceResult } from "../../domain/LiquidRpc";
import { parseLiquidAssetId, parseLiquidGetBalanceParams } from "../../domain/validation";
import type { ConfirmationPort } from "../../ports/ConfirmationPort";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../ports/LiquidWalletBackend";

export type LiquidGetBalanceContext = {
	chainId: LiquidChainId;
	confirm?: ConfirmationPort;
	keyManagerState: KeyManagerState;
	walletBackend: LiquidWalletBackend;
};

export async function getLiquidBalance(
	params: unknown,
	context: LiquidGetBalanceContext,
): Promise<LiquidGetBalanceResult> {
	const parsedParams = parseLiquidGetBalanceParams(params);
	const account = await context.walletBackend.resolveAccount({
		chainId: context.chainId,
		keyManagerState: context.keyManagerState,
	});
	const requestedAsset = resolveRequestedAsset(parsedParams.assetId, account);

	await requireBalanceDisclosureConfirmation(context, account, requestedAsset.assetId);
	await context.walletBackend.syncAccount(account);

	return {
		accountIdentifier: account.accountIdentifier,
		assetId: requestedAsset.assetId,
		balance: context.walletBackend.getBalance(account, requestedAsset.rawAssetId),
		chainId: account.chainId,
		policyAssetId: account.policyAssetId,
	};
}

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

async function requireBalanceDisclosureConfirmation(
	context: LiquidGetBalanceContext,
	account: LiquidWalletAccount,
	assetId: string,
): Promise<void> {
	if (!context.confirm) {
		throw new WalletRpcResourceUnavailableError(
			"Balance disclosure requires a confirmation surface.",
			undefined,
			WALLET_RPC_ERROR_REASONS.CONFIRMATION_UNAVAILABLE,
		);
	}

	const confirmed = await context.confirm({
		data: {
			accountIdentifier: account.accountIdentifier,
			assetId,
			chainId: account.chainId,
		},
		message: "A dapp wants to read the Liquid balance for this account.",
		title: "Share Liquid balance?",
	});

	if (!confirmed) {
		throw new WalletRpcUserRejectedError();
	}
}
