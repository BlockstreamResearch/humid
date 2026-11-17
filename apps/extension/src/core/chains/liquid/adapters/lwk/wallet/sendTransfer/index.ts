import type { Pset } from "lwk_wasm";

import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcInvalidParamsError,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import type { LiquidWalletAccount } from "../../../../application/backends/LiquidWalletBackend";
import { DEFAULT_FEE_RATE_SATS_PER_KVB } from "../../../../application/feeSpeeds";
import { LIQUID_MAINNET_CHAIN_ID } from "../../../../domain/LiquidChain";
import type {
	LiquidEstimateMaxSendParams,
	LiquidEstimateMaxSendResult,
	LiquidSendTransferParams,
	LiquidSendTransferResult,
	LiquidTransferFee,
	LiquidTransferQuote,
	LiquidTransferReview,
} from "../../../../domain/LiquidRpc";
import { toLiquidAssetId } from "../../../../domain/validation";
import { loadLwkWasm, type LwkWasmModule } from "../../loadLwkWasm";
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

export async function quoteTransfer(
	account: LiquidWalletAccount,
	params: LiquidSendTransferParams,
	rawAssetId: string,
	feeRateSatsPerKvb: number,
): Promise<LiquidTransferQuote> {
	const implementation = getLwkImplementation(account);
	const lwk = await loadLwkWasm();
	const pset = buildTransfer(lwk, account, params, rawAssetId, feeRateSatsPerKvb);
	const feeSats = feeOf(pset);
	const amount = isSendAll(account, params, rawAssetId)
		? BigInt(
				readWalletBalanceForAsset(implementation.wollet, account.chainId, account.rawPolicyAssetId),
			) - feeSats
		: BigInt(params.amount);

	return { amount: amount.toString(), feeRateSatsPerKvb, feeSats: feeSats.toString() };
}

export async function sendTransfer(
	account: LiquidWalletAccount,
	params: LiquidSendTransferParams,
	rawAssetId: string,
	fee?: LiquidTransferFee,
): Promise<LiquidSendTransferResult> {
	const implementation = getLwkImplementation(account);
	const lwk = await loadLwkWasm();
	const unsignedPset = buildTransfer(lwk, account, params, rawAssetId, fee?.feeRateSatsPerKvb);

	if (fee !== undefined && feeOf(unsignedPset).toString() !== fee.feeSats) {
		throw new WalletRpcInvalidParamsError(
			"The network fee changed. Please review the transfer again.",
			{ feeSats: fee.feeSats },
			WALLET_RPC_ERROR_REASONS.INVALID_TRANSFER_REQUEST,
		);
	}

	try {
		const signedPset = implementation.signer.sign(unsignedPset);
		const finalizedPset = implementation.wollet.finalize(signedPset);
		const { txid } = await getSyncWorkerClient().broadcast({
			chain: account.chain,
			psetBase64: finalizedPset.toString(),
		});

		return { txid };
	} catch (error) {
		const failure = new WalletRpcResourceUnavailableError(
			"Could not sign and broadcast the Liquid transfer.",
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

	const quote = await quoteTransfer(
		account,
		{ amount: "0", recipientAddress: params.recipientAddress, sendAll: true },
		rawAssetId,
		DEFAULT_FEE_RATE_SATS_PER_KVB,
	);
	const maxAmount = BigInt(quote.amount);

	return { feeSats: quote.feeSats, maxAmount: (maxAmount > 0n ? maxAmount : 0n).toString() };
}

function buildTransfer(
	lwk: LwkWasmModule,
	account: LiquidWalletAccount,
	params: LiquidSendTransferParams,
	rawAssetId: string,
	feeRateSatsPerKvb: number | undefined,
): Pset {
	const implementation = getLwkImplementation(account);

	try {
		const recipientAddress = new lwk.Address(params.recipientAddress);
		validateRecipientNetwork(account, recipientAddress);
		const amount = BigInt(params.amount);
		let builder = new lwk.TxBuilder(implementation.network);

		if (feeRateSatsPerKvb !== undefined) {
			builder = builder.feeRate(feeRateSatsPerKvb);
		}

		if (isSendAll(account, params, rawAssetId)) {
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

		return builder.finish(implementation.wollet);
	} catch (error) {
		if (error instanceof WalletRpcInvalidParamsError) {
			throw error;
		}

		const failure = String(error).includes("InsufficientFunds")
			? new WalletRpcInvalidParamsError(
					"Not enough funds to cover the amount and the network fee.",
					undefined,
					WALLET_RPC_ERROR_REASONS.INVALID_TRANSFER_REQUEST,
				)
			: new WalletRpcResourceUnavailableError(
					"Could not build the Liquid transfer.",
					undefined,
					WALLET_RPC_ERROR_REASONS.WALLET_TRANSFER_FAILED,
				);

		failure.cause = error;

		throw failure;
	}
}

function feeOf(pset: Pset): bigint {
	return pset
		.outputs()
		.filter((output) => output.scriptPubkey().bytes().length === 0)
		.reduce((total, output) => total + (output.amount() ?? 0n), 0n);
}

function isSendAll(
	account: LiquidWalletAccount,
	params: LiquidSendTransferParams,
	rawAssetId: string,
): boolean {
	return params.sendAll === true && rawAssetId === account.rawPolicyAssetId;
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
