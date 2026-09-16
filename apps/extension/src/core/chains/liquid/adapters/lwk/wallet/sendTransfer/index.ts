import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcInvalidParamsError,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidWalletAccount } from "../../../../application/backends/LiquidWalletBackend";
import { LIQUID_MAINNET_CHAIN_ID } from "../../../../domain/LiquidChain";
import type {
	LiquidEstimateMaxSendParams,
	LiquidEstimateMaxSendResult,
	LiquidSendTransferParams,
	LiquidSendTransferResult,
	LiquidTransferReview,
} from "../../../../domain/LiquidRpc";
import { toLiquidAssetId } from "../../../../domain/validation";
import { loadLwkWasm } from "../../loadLwkWasm";
import { getSyncWorkerClient } from "../../sync-worker/createSyncWorkerClient";
import { getLwkImplementation } from "../getLwkImplementation";
import { readWalletBalanceForAsset } from "../readWalletData";

export async function inspectTransfer(
	account: LiquidWalletAccount,
	params: LiquidSendTransferParams,
	rawAssetId: string,
): Promise<LiquidTransferReview> {
	if (params.memo) {
		throw new WalletRpcInvalidParamsError(
			"Liquid transfer memos are not supported by this wallet backend yet.",
			{ memo: params.memo },
			WALLET_RPC_ERROR_REASONS.UNSUPPORTED_MEMO,
		);
	}

	const lwk = await loadLwkWasm();

	try {
		const recipientAddress = new lwk.Address(params.recipientAddress);
		validateRecipientNetwork(account, recipientAddress);

		return {
			accountIdentifier: account.accountIdentifier,
			amount: params.amount,
			assetId: toLiquidAssetId(account.chainId, rawAssetId),
			chainId: account.chainId,
			memo: params.memo,
			policyAssetId: account.policyAssetId,
			recipientAddress: recipientAddress.toString(),
			recipientConfidential: recipientAddress.isBlinded(),
		};
	} catch (error) {
		if (error instanceof WalletRpcInvalidParamsError) {
			throw error;
		}

		throw new WalletRpcInvalidParamsError(
			"Invalid Liquid recipient address.",
			{ recipientAddress: params.recipientAddress },
			WALLET_RPC_ERROR_REASONS.INVALID_TRANSFER_REQUEST,
		);
	}
}

export async function sendTransfer(
	account: LiquidWalletAccount,
	params: LiquidSendTransferParams,
	rawAssetId: string,
): Promise<LiquidSendTransferResult> {
	if (params.memo) {
		throw new WalletRpcInvalidParamsError(
			"Liquid transfer memos are not supported by this wallet backend yet.",
			{ memo: params.memo },
			WALLET_RPC_ERROR_REASONS.UNSUPPORTED_MEMO,
		);
	}

	const implementation = getLwkImplementation(account);
	const lwk = await loadLwkWasm();

	try {
		const recipientAddress = new lwk.Address(params.recipientAddress);
		validateRecipientNetwork(account, recipientAddress);
		const amount = BigInt(params.amount);
		let builder = new lwk.TxBuilder(implementation.network);

		if (params.sendAll && rawAssetId === account.rawPolicyAssetId) {
			builder = builder.drainLbtcWallet().drainLbtcTo(recipientAddress);
		} else if (!recipientAddress.isBlinded()) {
			builder = builder.addExplicitRecipient(
				recipientAddress,
				amount,
				lwk.AssetId.fromString(rawAssetId),
			);
		} else if (rawAssetId === account.rawPolicyAssetId) {
			builder = builder.addLbtcRecipient(recipientAddress, amount);
		} else {
			builder = builder.addRecipient(recipientAddress, amount, lwk.AssetId.fromString(rawAssetId));
		}

		const unsignedPset = builder.finish(implementation.wollet);
		const signedPset = implementation.signer.sign(unsignedPset);
		const finalizedPset = implementation.wollet.finalize(signedPset);
		const { txid } = await getSyncWorkerClient().broadcast({
			chain: account.chain,
			psetBase64: finalizedPset.toString(),
		});

		return { txid };
	} catch (error) {
		if (error instanceof WalletRpcInvalidParamsError) {
			throw error;
		}

		const failure = new WalletRpcResourceUnavailableError(
			"Could not build, sign, and broadcast the Liquid transfer.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_TRANSFER_FAILED,
		);

		failure.cause = error;

		throw failure;
	}
}

export async function estimateMaxSend(
	account: LiquidWalletAccount,
	params: LiquidEstimateMaxSendParams,
	rawAssetId: string,
): Promise<LiquidEstimateMaxSendResult> {
	const implementation = getLwkImplementation(account);

	if (rawAssetId !== account.rawPolicyAssetId) {
		return {
			feeSats: "0",
			maxAmount: readWalletBalanceForAsset(implementation.wollet, account.chainId, rawAssetId),
		};
	}

	const lwk = await loadLwkWasm();

	try {
		const recipientAddress = new lwk.Address(params.recipientAddress);
		validateRecipientNetwork(account, recipientAddress);

		const pset = new lwk.TxBuilder(implementation.network)
			.drainLbtcWallet()
			.drainLbtcTo(recipientAddress)
			.finish(implementation.wollet);

		const details = implementation.wollet.psetDetails(pset);
		const balance = details.balance();
		const fee = balance.feesIn(lwk.AssetId.fromString(account.rawPolicyAssetId));

		balance.free();
		details.free();
		pset.free();

		const lbtcBalance = BigInt(
			readWalletBalanceForAsset(implementation.wollet, account.chainId, account.rawPolicyAssetId),
		);
		const maxAmount = lbtcBalance > fee ? lbtcBalance - fee : 0n;

		return { feeSats: fee.toString(), maxAmount: maxAmount.toString() };
	} catch (error) {
		if (error instanceof WalletRpcInvalidParamsError) {
			throw error;
		}

		const failure = new WalletRpcResourceUnavailableError(
			"Could not estimate the maximum sendable Liquid amount.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_TRANSFER_FAILED,
		);

		failure.cause = error;

		throw failure;
	}
}

function validateRecipientNetwork(
	account: LiquidWalletAccount,
	recipientAddress: { isMainnet: () => boolean; toString: () => string },
): void {
	if (recipientAddress.isMainnet() !== (account.chainId === LIQUID_MAINNET_CHAIN_ID)) {
		throw new WalletRpcInvalidParamsError(
			"Liquid recipient address network does not match the connected chain.",
			{
				chainId: account.chainId,
				recipientAddress: recipientAddress.toString(),
			},
			WALLET_RPC_ERROR_REASONS.INVALID_TRANSFER_REQUEST,
		);
	}
}
