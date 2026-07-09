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
			// Native "Max": drain every L-BTC input to the recipient, ignoring `amount`. LWK selects all
			// inputs and subtracts the fee, so the broadcast pays whatever the fee is off the freshly
			// re-synced UTXO set — no dependence on the amount estimated earlier (no feeRate() = default).
			builder = builder.drainLbtcWallet().drainLbtcTo(recipientAddress);
		} else if (rawAssetId === account.rawPolicyAssetId) {
			builder = builder.addLbtcRecipient(recipientAddress, amount);
		} else {
			builder = builder.addRecipient(recipientAddress, amount, lwk.AssetId.fromString(rawAssetId));
		}

		const unsignedPset = builder.finish(implementation.wollet);
		const signedPset = implementation.signer.sign(unsignedPset);
		const finalizedPset = implementation.wollet.finalize(signedPset);
		// Build/sign/finalize stay in the service worker (where the vault keys live). Only the
		// already-signed, finalized PSET crosses to a `window`-having context (the offscreen
		// document on Chrome) to broadcast, because LWK's Esplora client needs `window` for its
		// async retry/sleep — the same reason the portfolio scan runs off the service worker.
		const { txid } = await getSyncWorkerClient().broadcast({
			chain: account.chain,
			psetBase64: finalizedPset.toString(),
		});

		return { txid };
	} catch (error) {
		if (error instanceof WalletRpcInvalidParamsError) {
			throw error;
		}

		// Attach the underlying failure as the cause so real errors (broadcast, insufficient funds,
		// address) stay diagnosable instead of collapsing into an opaque WALLET_TRANSFER_FAILED.
		const failure = new WalletRpcResourceUnavailableError(
			"Could not build, sign, and broadcast the Liquid transfer.",
			undefined,
			WALLET_RPC_ERROR_REASONS.WALLET_TRANSFER_FAILED,
		);

		failure.cause = error;

		throw failure;
	}
}

/**
 * Estimate the maximum sendable amount for an asset. Asset-aware:
 *
 * - Issued (non-native) asset: the fee is always paid separately in L-BTC, so "max" is simply the
 *   full asset balance off the (already synced) wollet — no PSET, no fee to subtract (`feeSats: "0"`).
 * - Native L-BTC: build a DRAIN PSET (all L-BTC inputs → recipient) and read LWK's computed fee, so
 *   the max is the L-BTC balance minus that fee. No `feeRate()` → LWK's default, matching what the
 *   real drain broadcast will pay. The caller must sync the account before this (the fee depends on
 *   the current UTXO set, and `lwk.Address` needs a real recipient to build the PSET against).
 */
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

		// The chain consumes each builder and `drainLbtcTo` consumes `recipientAddress`, so the only
		// wasm handles left to us are `pset` (from finish), its `details`, and their `balance`.
		const pset = new lwk.TxBuilder(implementation.network)
			.drainLbtcWallet()
			.drainLbtcTo(recipientAddress)
			.finish(implementation.wollet);

		const details = implementation.wollet.psetDetails(pset);
		const balance = details.balance();
		// `feesIn` consumes the AssetId it's given (so no separate free); the fee is denominated in the
		// policy asset (L-BTC), which is the only asset that ever pays a Liquid fee.
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

		// Surface the underlying failure (e.g. insufficient L-BTC to cover the drain fee) as the cause.
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
