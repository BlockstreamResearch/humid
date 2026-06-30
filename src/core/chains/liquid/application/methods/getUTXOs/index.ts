import type { KeyManagerState } from "@/core/key-manager/types";
import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcResourceUnavailableError,
	WalletRpcUserRejectedError,
} from "@/core/wallet-rpc/errors";

import type { ParsedLiquidAssetId } from "../../../domain/LiquidAsset";
import type { LiquidChainId } from "../../../domain/LiquidChain";
import type { LiquidGetUTXOsResult } from "../../../domain/LiquidRpc";
import { parseLiquidAssetId, parseLiquidGetUTXOsParams } from "../../../domain/validation";
import type { ConfirmationPort } from "../../../ports/ConfirmationPort";
import type { LiquidWalletAccount, LiquidWalletBackend } from "../../../ports/LiquidWalletBackend";

export type LiquidGetUTXOsContext = {
	chainId: LiquidChainId;
	confirm?: ConfirmationPort;
	keyManagerState: KeyManagerState;
	walletBackend: LiquidWalletBackend;
};

export async function getLiquidUTXOs(
	params: unknown,
	context: LiquidGetUTXOsContext,
): Promise<LiquidGetUTXOsResult> {
	const parsedParams = parseLiquidGetUTXOsParams(params);
	const account = await context.walletBackend.resolveAccount({
		chainId: context.chainId,
		keyManagerState: context.keyManagerState,
	});
	const requestedAsset = resolveRequestedAsset(parsedParams.assetId, account);

	await requireUTXODisclosureConfirmation(context, account, requestedAsset.assetId);
	await context.walletBackend.syncAccount(account);

	return {
		accountIdentifier: account.accountIdentifier,
		assetId: requestedAsset.assetId,
		chainId: account.chainId,
		policyAssetId: account.policyAssetId,
		utxos: context.walletBackend.getUtxos(account, requestedAsset.rawAssetId),
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

async function requireUTXODisclosureConfirmation(
	context: LiquidGetUTXOsContext,
	account: LiquidWalletAccount,
	assetId: string,
): Promise<void> {
	if (!context.confirm) {
		throw new WalletRpcResourceUnavailableError(
			"UTXO disclosure requires a confirmation surface.",
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
		message: "A dapp wants to read the Liquid UTXOs for this account.",
		title: "Share Liquid UTXOs?",
	});

	if (!confirmed) {
		throw new WalletRpcUserRejectedError();
	}
}
