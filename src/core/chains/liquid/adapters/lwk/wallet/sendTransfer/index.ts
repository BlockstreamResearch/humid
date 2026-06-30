import {
	WALLET_RPC_ERROR_REASONS,
	WalletRpcInvalidParamsError,
	WalletRpcResourceUnavailableError,
} from "@/core/wallet-rpc/errors";

import { LIQUID_MAINNET_CHAIN_ID } from "../../../../domain/LiquidChain";
import type {
	LiquidSendTransferParams,
	LiquidSendTransferResult,
	LiquidTransferReview,
} from "../../../../domain/LiquidRpc";
import { toLiquidAssetId } from "../../../../domain/validation";
import type { LiquidWalletAccount } from "../../../../ports/LiquidWalletBackend";
import { loadLwkWasm } from "../../loadLwkWasm";
import { getLwkImplementation } from "../getLwkImplementation";

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

		if (rawAssetId === account.rawPolicyAssetId) {
			builder = builder.addLbtcRecipient(recipientAddress, amount);
		} else {
			builder = builder.addRecipient(recipientAddress, amount, lwk.AssetId.fromString(rawAssetId));
		}

		const unsignedPset = builder.finish(implementation.wollet);
		const signedPset = implementation.signer.sign(unsignedPset);
		const finalizedPset = implementation.wollet.finalize(signedPset);
		const txid = await implementation.network.defaultEsploraClient().broadcast(finalizedPset);

		return {
			txid: txid.toString(),
		};
	} catch (error) {
		if (error instanceof WalletRpcInvalidParamsError) {
			throw error;
		}

		throw new WalletRpcResourceUnavailableError(
			"Could not build, sign, and broadcast the Liquid transfer.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_TRANSFER_FAILED,
		);
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
